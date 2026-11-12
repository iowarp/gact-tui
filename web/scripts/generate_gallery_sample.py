"""Generate the small displacement plot shown by the A2UI gallery's file examples.

The dark plot is the gallery fixture. The onboarding tour's practice viewer shows
the light one in the light theme, so the plot matches the page around it.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

PALETTES = {
    "gallery-sample.png": {
        "background": "#0d1117",
        "line": "#36c9d0",
        "marker": "#f7ad54",
        "title": "#e8eef4",
        "label": "#aab7c4",
        "grid": "#34414d",
    },
    "gallery-sample-light.png": {
        "background": "#ffffff",
        "line": "#13868c",
        "marker": "#d9821a",
        "title": "#1f2933",
        "label": "#52606d",
        "grid": "#c5ccd3",
    },
}


def plot(name: str, colors: dict[str, str]) -> None:
    """Write one deterministic sample plot for the local gallery fixture."""
    days = np.arange(90)
    displacement = 0.045 * days + 1.2 * np.sin(days / 9) + 0.25 * np.sin(days / 2.7)
    fig, ax = plt.subplots(figsize=(9, 4.2), dpi=120)
    fig.patch.set_facecolor(colors["background"])
    ax.set_facecolor(colors["background"])
    ax.plot(days, displacement, color=colors["line"], linewidth=2.4)
    ax.fill_between(days, displacement - 0.35, displacement + 0.35, color=colors["line"], alpha=0.13)
    ax.scatter([29, 61, 82], displacement[[29, 61, 82]], s=33, color=colors["marker"], zorder=4)
    ax.set_title("Vertical displacement, station BKL1", loc="left", color=colors["title"], pad=18, fontsize=15)
    ax.set_xlabel("Days since observation began", color=colors["label"], labelpad=10)
    ax.set_ylabel("Displacement (mm)", color=colors["label"], labelpad=10)
    ax.tick_params(colors=colors["label"])
    ax.grid(color=colors["grid"], alpha=0.45, linewidth=0.6)
    for spine in ax.spines.values():
        spine.set_color(colors["grid"])
    fig.tight_layout(pad=2.1)
    output = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / name
    fig.savefig(output, facecolor=fig.get_facecolor())
    plt.close(fig)


def main() -> None:
    """Write the dark and light sample plots."""
    for name, colors in PALETTES.items():
        plot(name, colors)


if __name__ == "__main__":
    main()