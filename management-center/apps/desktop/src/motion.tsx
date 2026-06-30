import { useRef, type CSSProperties, type ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/** 切换页面时，把内容的直接子节点做错落上浮入场。 */
export function Stage({ viewKey, children }: { viewKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const kids = ref.current ? Array.from(ref.current.children) : [];
      if (kids.length === 0) return;
      gsap.fromTo(
        kids,
        { autoAlpha: 0, y: 26, scale: 0.985 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.07,
          clearProps: "transform,opacity,visibility",
          transformOrigin: "50% 0%",
        },
      );
    },
    { dependencies: [viewKey], scope: ref },
  );
  return <div ref={ref}>{children}</div>;
}

/** 数字滚动到目标值（控制台仪表感）。 */
export function CountUp({
  value,
  className,
  style,
}: {
  value: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useGSAP(
    () => {
      const target = Number.isFinite(value) ? value : 0;
      const obj = { v: prev.current };
      gsap.to(obj, {
        v: target,
        duration: 0.9,
        ease: "power2.out",
        onUpdate: () => {
          if (ref.current) ref.current.textContent = String(Math.round(obj.v));
        },
      });
      prev.current = target;
    },
    { dependencies: [value] },
  );
  return (
    <span ref={ref} className={className} style={style}>
      0
    </span>
  );
}

/** 元素入场（淡入 + 轻微上浮），用于非 Stage 直管的局部块。 */
export function FadeIn({
  children,
  delay = 0,
  y = 14,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      gsap.fromTo(
        ref.current,
        { opacity: 0, y },
        { opacity: 1, y: 0, duration: 0.5, delay, ease: "power3.out", clearProps: "transform,opacity" },
      );
    },
    { scope: ref },
  );
  return (
    <div ref={ref} style={style}>
      {children}
    </div>
  );
}
