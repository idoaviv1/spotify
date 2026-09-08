import { useState, useRef, useEffect } from 'react';

/**
 * Hook to provide fluid pull-down / drag-to-dismiss gesture on modal bottom sheets.
 * Works seamlessly with both mouse drag (desktop) and touch swiping (mobile).
 */
export default function useDragToClose({ onClose, threshold = 80 }) {
  const [isDragging, setIsDragging] = useState(false);
  const modalContentRef = useRef(null);
  const overlayRef = useRef(null);

  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityYRef = useRef(0);

  const startDrag = (clientY) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    startYRef.current = clientY;
    lastYRef.current = clientY;
    lastTimeRef.current = Date.now();
    velocityYRef.current = 0;

    if (modalContentRef.current) {
      modalContentRef.current.style.transition = 'none';
    }
  };

  const onMouseDown = (e) => {
    // Only primary left button
    if (e.button !== 0) return;
    if (e.target.closest('button') || e.target.closest('input')) return;
    e.preventDefault();
    startDrag(e.clientY);
  };

  const onTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    if (e.target.closest('button') || e.target.closest('input')) return;
    startDrag(e.touches[0].clientY);
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      const clientY = e.clientY;
      const deltaY = clientY - startYRef.current;

      const now = Date.now();
      const dt = now - lastTimeRef.current;
      if (dt > 0) {
        velocityYRef.current = (clientY - lastYRef.current) / dt;
      }
      lastYRef.current = clientY;
      lastTimeRef.current = now;

      if (modalContentRef.current) {
        if (deltaY >= 0) {
          modalContentRef.current.style.transform = `translateY(${deltaY}px)`;
          if (overlayRef.current) {
            overlayRef.current.style.opacity = `${Math.max(0.15, 1 - deltaY / 400)}`;
          }
        } else {
          // Upward rubber-band drag resistance
          const resisted = deltaY * 0.18;
          modalContentRef.current.style.transform = `translateY(${resisted}px)`;
        }
      }
    };

    const onTouchMove = (e) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return;
      const clientY = e.touches[0].clientY;
      const deltaY = clientY - startYRef.current;

      const now = Date.now();
      const dt = now - lastTimeRef.current;
      if (dt > 0) {
        velocityYRef.current = (clientY - lastYRef.current) / dt;
      }
      lastYRef.current = clientY;
      lastTimeRef.current = now;

      if (modalContentRef.current) {
        if (deltaY >= 0) {
          modalContentRef.current.style.transform = `translateY(${deltaY}px)`;
          if (overlayRef.current) {
            overlayRef.current.style.opacity = `${Math.max(0.15, 1 - deltaY / 400)}`;
          }
        } else {
          const resisted = deltaY * 0.18;
          modalContentRef.current.style.transform = `translateY(${resisted}px)`;
        }
      }
    };

    const endDrag = (finalY) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);

      const deltaY = finalY - startYRef.current;
      const isFlick = deltaY > 35 && velocityYRef.current > 0.35;
      const shouldClose = deltaY > threshold || isFlick;

      if (modalContentRef.current) {
        if (shouldClose) {
          modalContentRef.current.style.transition = 'transform 0.24s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease';
          modalContentRef.current.style.transform = 'translateY(100%)';
          if (overlayRef.current) {
            overlayRef.current.style.transition = 'opacity 0.2s ease';
            overlayRef.current.style.opacity = '0';
          }
          setTimeout(() => {
            onClose();
          }, 220);
        } else {
          // Snap back up
          modalContentRef.current.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)';
          modalContentRef.current.style.transform = 'translateY(0)';
          if (overlayRef.current) {
            overlayRef.current.style.transition = 'opacity 0.25s ease';
            overlayRef.current.style.opacity = '1';
          }
          setTimeout(() => {
            if (modalContentRef.current) {
              modalContentRef.current.style.transform = '';
              modalContentRef.current.style.transition = '';
            }
            if (overlayRef.current) {
              overlayRef.current.style.opacity = '';
              overlayRef.current.style.transition = '';
            }
          }, 250);
        }
      }
    };

    const onMouseUp = (e) => endDrag(e.clientY);
    const onTouchEnd = () => endDrag(lastYRef.current);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [onClose, threshold]);

  return {
    modalContentRef,
    overlayRef,
    isDragging,
    handleDragStartProps: {
      onMouseDown,
      onTouchStart,
    },
  };
}
