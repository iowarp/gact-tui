//! Render the registered Shell handler's icon without starting its application.
use std::path::Path;
use windows::{
    core::{HSTRING, PWSTR},
    Win32::{
        Graphics::Gdi::{
            CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GdiFlush, SelectObject,
            BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ,
        },
        UI::{
            Shell::{IAssocHandler, SHDefExtractIconW, SHLoadIndirectString},
            WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL, HICON},
        },
    },
};

const SIDE: usize = 32;
const PIXELS: usize = SIDE * SIDE * 4;

struct OwnedIcon(HICON);
impl Drop for OwnedIcon {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            let _ = unsafe { DestroyIcon(self.0) };
        }
    }
}

struct Canvas {
    dc: HDC,
    bitmap: HBITMAP,
    previous: HGDIOBJ,
    bits: *mut u8,
}
impl Canvas {
    fn new() -> Option<Self> {
        let dc = unsafe { CreateCompatibleDC(None) };
        if dc.is_invalid() {
            return None;
        }
        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: SIDE as i32,
                biHeight: -(SIDE as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits = std::ptr::null_mut();
        let bitmap = match unsafe {
            CreateDIBSection(Some(dc), &info, DIB_RGB_COLORS, &mut bits, None, 0)
        } {
            Ok(bitmap) => bitmap,
            Err(_) => {
                let _ = unsafe { DeleteDC(dc) };
                return None;
            }
        };
        if bits.is_null() {
            let _ = unsafe { DeleteObject(HGDIOBJ(bitmap.0)) };
            let _ = unsafe { DeleteDC(dc) };
            return None;
        }
        let previous = unsafe { SelectObject(dc, HGDIOBJ(bitmap.0)) };
        if previous.is_invalid() {
            let _ = unsafe { DeleteObject(HGDIOBJ(bitmap.0)) };
            let _ = unsafe { DeleteDC(dc) };
            return None;
        }
        Some(Self {
            dc,
            bitmap,
            previous,
            bits: bits.cast(),
        })
    }

    fn render(&self, icon: HICON, background: u8) -> Option<Vec<u8>> {
        // The DIB is exactly SIDE x SIDE top-down BGRA and stays owned by this canvas.
        let pixels = unsafe { std::slice::from_raw_parts_mut(self.bits, PIXELS) };
        pixels.fill(background);
        unsafe {
            DrawIconEx(
                self.dc,
                0,
                0,
                icon,
                SIDE as i32,
                SIDE as i32,
                0,
                None,
                DI_NORMAL,
            )
        }
        .ok()?;
        if !unsafe { GdiFlush() }.as_bool() {
            return None;
        }
        Some(pixels.to_vec())
    }
}
impl Drop for Canvas {
    fn drop(&mut self) {
        unsafe {
            SelectObject(self.dc, self.previous);
            let _ = DeleteObject(HGDIOBJ(self.bitmap.0));
            let _ = DeleteDC(self.dc);
        }
    }
}

// Two backgrounds recover transparency for both alpha icons and legacy AND-mask icons.
fn transparent_rgba(black: &[u8], white: &[u8]) -> Vec<u8> {
    black
        .chunks_exact(4)
        .zip(white.chunks_exact(4))
        .flat_map(|(black, white)| {
            let transparent = (0..3)
                .map(|channel| white[channel].saturating_sub(black[channel]))
                .max()
                .unwrap_or(255);
            let alpha = 255 - transparent;
            let unpremultiply = |channel: u8| -> u8 {
                if alpha == 0 {
                    0
                } else {
                    ((u32::from(channel) * 255 + u32::from(alpha) / 2) / u32::from(alpha)).min(255)
                        as u8
                }
            };
            [
                unpremultiply(black[2]),
                unpremultiply(black[1]),
                unpremultiply(black[0]),
                alpha,
            ]
        })
        .collect()
}

fn resolve_location(location: &str) -> Option<String> {
    if location.is_empty() {
        return None;
    }
    if !location.starts_with('@') {
        return Some(location.to_owned());
    }
    // Store handlers supply a Package Resource Index reference instead of a filename.
    // Let the Shell resolve the current user's package and its resource qualifiers.
    let mut path = vec![0u16; 32_768];
    unsafe { SHLoadIndirectString(&HSTRING::from(location), &mut path, None) }.ok()?;
    let end = path.iter().position(|value| *value == 0)?;
    let resolved = String::from_utf16(&path[..end]).ok()?;
    (!resolved.is_empty() && !resolved.starts_with('@')).then_some(resolved)
}

pub(super) fn application_icon(handler: &IAssocHandler) -> Option<String> {
    let mut location = PWSTR::null();
    let mut index = 0;
    unsafe { handler.GetIconLocation(&mut location, &mut index) }.ok()?;
    let location = resolve_location(&unsafe { super::owned_string(location) })?;
    // Packaged applications can expose a PNG instead of an executable icon resource.
    if Path::new(&location)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("png"))
    {
        use std::io::Read;
        let mut bytes = Vec::new();
        std::fs::File::open(&location)
            .ok()?
            .take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .ok()?;
        return super::super::png_data_url(&bytes);
    }
    let mut icon = OwnedIcon(HICON::default());
    unsafe {
        SHDefExtractIconW(
            &HSTRING::from(location),
            index,
            0,
            Some(&mut icon.0),
            None,
            SIDE as u32,
        )
    }
    .ok()
    .ok()?;
    if icon.0.is_invalid() {
        return None;
    }
    let canvas = Canvas::new()?;
    let rgba = transparent_rgba(&canvas.render(icon.0, 0)?, &canvas.render(icon.0, 255)?);
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut bytes, SIDE as u32, SIDE as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(&rgba).ok()?;
        writer.finish().ok()?;
    }
    super::super::png_data_url(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_direct_paths_and_rejects_unresolvable_package_resources() {
        let path = r"C:\Program Files\Example\app.exe";
        assert_eq!(resolve_location(path).as_deref(), Some(path));
        assert!(resolve_location("").is_none());
        assert!(
            resolve_location("@{clio-uninstalled-icon-test?ms-resource://invalid/icon}").is_none()
        );
    }

    #[test]
    fn recovers_transparent_opaque_and_half_transparent_icon_pixels() {
        assert_eq!(
            transparent_rgba(&[0, 0, 0, 0], &[255, 255, 255, 0]),
            [0, 0, 0, 0]
        );
        assert_eq!(
            transparent_rgba(&[30, 20, 10, 0], &[30, 20, 10, 0]),
            [10, 20, 30, 255]
        );
        assert_eq!(
            transparent_rgba(&[0, 0, 128, 0], &[127, 127, 255, 0]),
            [255, 0, 0, 128]
        );
    }
}
