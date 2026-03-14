'use client';
import * as React from 'react';
import { useInView } from 'motion/react';

function useIsInView(ref: React.RefObject<HTMLElement | null>, options: { inView?: boolean; inViewOnce?: boolean; inViewMargin?: string } = {}) {
  const { inView, inViewOnce = false, inViewMargin = '0px' } = options;
  const localRef = React.useRef<HTMLElement | null>(null);
  React.useImperativeHandle(ref, () => localRef.current);
  const inViewResult = useInView(localRef, {
    once: inViewOnce,
    margin: inViewMargin,
  });
  const isInView = !inView || inViewResult;
  return { ref: localRef, isInView };
}

export { useIsInView };
