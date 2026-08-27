import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'
import { ClioInteractiveRow } from './interactive-row'
import { ClioStatus } from './status'

describe('CLIO interaction semantics', () => {
  it('always renders an operational state as text plus a semantic icon', async () => {
    const { container } = render(<ClioStatus detail="Elapsed 12 seconds" value="running" />)

    expect(screen.getByText('Running')).toBeVisible()
    expect(screen.getByText(/Elapsed 12 seconds/)).toHaveClass('sr-only')
    expect(container.querySelector('svg')).toBeTruthy()
    expect((await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([])
  })

  it('keeps row actions keyboard and touch accessible without layout shifts', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ClioInteractiveRow actions={<Button>Copy path</Button>} tabIndex={0}>
        <span>flat-NDP</span>
      </ClioInteractiveRow>,
    )

    const action = screen.getByRole('button', { name: 'Copy path' })
    expect(action).toBeVisible()
    await user.tab()
    expect(container.firstElementChild).toHaveFocus()
    await user.tab()
    expect(action).toHaveFocus()
    expect(action.parentElement).toHaveClass(
      'opacity-65',
      'group-focus-within/row:opacity-100',
    )
    expect((await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([])
  })
})
