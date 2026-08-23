import { cjk } from '@streamdown/cjk'
import { math } from '@streamdown/math'
import type { ComponentProps } from 'react'
import { Streamdown } from 'streamdown'

const streamdownPlugins = { cjk, math }

export function MarkdownText(props: ComponentProps<typeof Streamdown>) {
  return <Streamdown plugins={streamdownPlugins} {...props} />
}
