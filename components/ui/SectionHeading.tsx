type SectionHeadingProps = {
  id: string;
  index: string;
  label: string;
  title: string;
  intro?: string;
};

export function SectionHeading({ id, index, label, title, intro }: SectionHeadingProps) {
  return (
    <div data-flow className="mb-12 max-w-3xl md:mb-16">
      <p className="label mb-5">
        <span className="tone">{index}</span>
        <span className="mx-2 text-mute">/</span>
        {label}
      </p>
      <h2 id={id} className="display text-4xl text-balance md:text-6xl">
        {title}
      </h2>
      {intro && (
        <p className="mt-5 max-w-[56ch] text-lg leading-relaxed text-mute">
          {intro}
        </p>
      )}
    </div>
  );
}
