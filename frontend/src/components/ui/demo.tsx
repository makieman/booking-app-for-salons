import { WordHeroPage } from "@/components/ui/scroll-hero-section";

export default function DemoOne() {
  return (
    <WordHeroPage
      items={['design.', 'prototype.', 'solve.', 'build.', 'develop.', 'cook.', 'ship.']}
      theme="system"
      animate
      hue={280}
      startVh={50}
      spaceVh={50}
      debug={false}
    />
  );
}
