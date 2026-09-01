export interface FrameClock {
  request(callback: FrameRequestCallback): number
  cancel(handle: number): void
}

const browserFrameClock: FrameClock = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
}

export class FrameBatcher<T> {
  private queued: T[] = []
  private handle?: number
  private stopped = false

  public constructor(
    private readonly commit: (items: readonly T[]) => void,
    private readonly clock: FrameClock = browserFrameClock,
  ) {}

  public push(item: T): void {
    if (this.stopped) return
    this.queued.push(item)
    if (this.handle !== undefined) return
    this.handle = this.clock.request(() => this.flush())
  }

  public flush(): void {
    if (this.handle !== undefined) this.clock.cancel(this.handle)
    this.handle = undefined
    if (this.queued.length === 0) return
    const queued = this.queued
    this.queued = []
    this.commit(queued)
  }

  public stop(options: { flush: boolean } = { flush: true }): void {
    if (this.stopped) return
    if (options.flush) this.flush()
    else if (this.handle !== undefined) this.clock.cancel(this.handle)
    this.handle = undefined
    this.queued = []
    this.stopped = true
  }
}
