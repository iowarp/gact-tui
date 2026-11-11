import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type ComponentProps,
} from 'react';

const MemoInput = memo(function MemoInput(props: ComponentProps<'input'>) {
  return <input {...props} />;
});

/**
 * A non-visual `<input>` (file picker, form mirror) that ignores owner re-renders.
 * React re-applies `name` and `type` on every commit of an input, so a hidden
 * input under a frequently re-rendering owner churns the DOM while idle. The
 * change handler is read through a ref; only real prop changes reach the node.
 */
export function StableInput({ onChange, ...props }: ComponentProps<'input'>) {
  const handler = useRef(onChange);
  useLayoutEffect(() => {
    handler.current = onChange;
  });
  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => handler.current?.(event),
    [],
  );
  return <MemoInput {...props} onChange={onChange ? change : undefined} />;
}
