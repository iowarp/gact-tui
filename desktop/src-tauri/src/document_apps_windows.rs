//! Shell handlers include Store applications and the user's default.
use super::DocumentApplication;
use std::path::Path;
use windows::{
    core::{HSTRING, PCWSTR, PWSTR},
    Win32::{
        System::Com::{
            CoInitializeEx, CoTaskMemFree, CoUninitialize, IDataObject, COINIT_APARTMENTTHREADED,
        },
        UI::Shell::{
            AssocQueryStringW, BHID_DataObject, IAssocHandler, IShellItem, SHAssocEnumHandlers,
            SHCreateItemFromParsingName, ASSOCF_NONE, ASSOCSTR_EXECUTABLE,
            ASSOCSTR_FRIENDLYAPPNAME, ASSOC_FILTER_NONE,
        },
    },
};
struct ComApartment;
impl ComApartment {
    fn new() -> Result<Self, String> {
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok() }
            .map_err(|error| format!("Read Windows file associations: {error}"))?;
        Ok(Self)
    }
}
impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}
unsafe fn owned_string(value: PWSTR) -> String {
    let result = unsafe { value.to_string() }.unwrap_or_default();
    unsafe { CoTaskMemFree(Some(value.0.cast())) };
    result
}
fn association_value(extension: &HSTRING, field: windows::Win32::UI::Shell::ASSOCSTR) -> String {
    let mut length = 0;
    unsafe {
        let _ = AssocQueryStringW(
            ASSOCF_NONE,
            field,
            extension,
            PCWSTR::null(),
            None,
            &mut length,
        );
    };
    if length == 0 {
        return String::new();
    }
    let mut buffer = vec![0u16; length as usize];
    let result = unsafe {
        AssocQueryStringW(
            ASSOCF_NONE,
            field,
            extension,
            PCWSTR::null(),
            Some(PWSTR(buffer.as_mut_ptr())),
            &mut length,
        )
    };
    if result.is_err() {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..buffer.iter().position(|v| *v == 0).unwrap_or(buffer.len())])
}
fn handlers(extension: &str) -> Result<Vec<(DocumentApplication, IAssocHandler)>, String> {
    if extension.is_empty() {
        return Ok(Vec::new());
    }
    let suffix = HSTRING::from(format!(".{extension}"));
    let default_exe = association_value(&suffix, ASSOCSTR_EXECUTABLE);
    let default_name = association_value(&suffix, ASSOCSTR_FRIENDLYAPPNAME);
    let enumeration = unsafe { SHAssocEnumHandlers(&suffix, ASSOC_FILTER_NONE) }
        .map_err(|error| format!("Read Windows file handlers: {error}"))?;
    let mut output = Vec::new();
    loop {
        let mut next = [None];
        let mut fetched = 0;
        unsafe { enumeration.Next(&mut next, Some(&mut fetched)) }
            .map_err(|error| format!("Enumerate Windows file handlers: {error}"))?;
        let Some(handler) = next[0].take().filter(|_| fetched > 0) else {
            break;
        };
        let id = unsafe { handler.GetName().map(|value| owned_string(value)) }.unwrap_or_default();
        let name =
            unsafe { handler.GetUIName().map(|value| owned_string(value)) }.unwrap_or_default();
        let is_default = (!default_exe.is_empty() && id.eq_ignore_ascii_case(&default_exe))
            || (!default_name.is_empty() && name == default_name);
        // Match the OS's Open With recommendations rather than wildcard-capable programs.
        if !is_default && unsafe { handler.IsRecommended() }.0 != 0 {
            continue;
        }
        output.push((
            DocumentApplication {
                id,
                name,
                is_default,
            },
            handler,
        ));
    }
    Ok(output)
}
pub(super) fn discover(
    extension: &str,
    _mime_type: &str,
) -> Result<Vec<DocumentApplication>, String> {
    let _apartment = ComApartment::new()?;
    Ok(handlers(extension)?
        .into_iter()
        .map(|(app, _)| app)
        .collect())
}
pub(super) fn open_in(id: &str, path: &Path, extension: &str) -> Result<(), String> {
    let _apartment = ComApartment::new()?;
    let handler = handlers(extension)?
        .into_iter()
        .find(|(app, _)| app.id == id)
        .map(|(_, handler)| handler)
        .ok_or("This app is no longer associated with this file type.")?;
    let filename = HSTRING::from(path.as_os_str());
    unsafe {
        let item: IShellItem = SHCreateItemFromParsingName(&filename, None)
            .map_err(|error| format!("Prepare file for its Windows handler: {error}"))?;
        let data: IDataObject = item
            .BindToHandler(None, &BHID_DataObject)
            .map_err(|error| format!("Prepare the file selection: {error}"))?;
        handler
            .Invoke(&data)
            .map_err(|error| format!("Open the selected app: {error}"))
    }
}
