import { useState, useEffect, useRef } from "react";

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

interface ViewportFitScaleProps {
  children: React.ReactNode;
  designWidth?: number;
  designHeight?: number;
  className?: string;
}

export function ViewportFitScale({
  children,
  designWidth = DESIGN_WIDTH,
  designHeight = DESIGN_HEIGHT,
  className = "",
}: ViewportFitScaleProps) {
  const [scale, setScale] = useState(1);
  const outerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = outerRef.current;
    if (!el?.parentElement) return;

    const updateScale = () => {
      const parent = outerRef.current?.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const s = Math.min(w / designWidth, h / designHeight, 1);
      setScale(s);
    };

    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(el.parentElement);
    window.addEventListener("resize", updateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [designWidth, designHeight]);

  return (
    <div
      ref={outerRef}
      className={`w-full h-full min-h-0 overflow-hidden ${className}`}
    >
      <div
        className="flex flex-col"
        style={{
          width: designWidth,
          minHeight: designHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
