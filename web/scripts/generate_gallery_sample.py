"""Generate the small displacement plot shown by the A2UI gallery's file examples."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402


def main() -> None:
    """Write a deterministic sample plot for the local gallery fixture."""
    days = np.arange(90)
    displacement = 0.045 * days + 1.2 * np.sin(days / 9) + 0.25 * np.sin(days / 2.7)
    fig, ax = plt.subplots(figsize=(9, 4.2), dpi=120)
    fig.patch.set_facecolor("#0d1117")
    ax.set_facecolor("#0d1117")
    ax.plot(days, displacement, color="#36c9d0", linewidth=2.4)
    ax.fill_between(days, displacement - 0.35, displacement + 0.35, color="#36c9d0", alpha=0.13)
    ax.scatter([29, 61, 82], displacement[[29, 61, 82]], s=33, color="#f7ad54", zorder=4)
    ax.set_title("Vertical displacement · station BKL1", loc="left", color="#e8eef4", pad=18, fontsize=15)
    ax.set_xlabel("Days since observation began", color="#aab7c4", labelpad=10)
    ax.set_ylabel("Displacement (mm)", color="#aab7c4", labelpad=10)
    ax.tick_params(colors="#aab7c4")
    ax.grid(color="#34414d", alpha=0.45, linewidth=0.6)
    for spine in ax.spines.values():
        spine.set_color("#34414d")
    fig.tight_layout(pad=2.1)
    output = Path(__file__).resolve().parents[1] / "public" / "gallery-sample.png"
    fig.savefig(output, facecolor=fig.get_facecolor())
    plt.close(fig)


if __name__ == "__main__":
    main()
