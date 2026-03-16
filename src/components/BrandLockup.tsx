import Image from "next/image";
import Link from "next/link";

type BrandLockupProps = {
  href?: string;
  className?: string;
  gapClassName?: string;
  iconClassName?: string;
  textClassName?: string;
};

export default function BrandLockup({
  href,
  className = "",
  gapClassName = "gap-[0.15rem]",
  iconClassName = "h-[2.8rem] w-[2.8rem] bg-transparent p-0",
  textClassName = "w-[8rem] sm:w-[8.7rem]",
}: BrandLockupProps) {
  const content = (
    <>
      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-[#89d957] p-1.5 ${iconClassName}`.trim()}>
        <Image src="/herder_logo_dog.png" alt="" width={321} height={321} className="h-full w-full object-contain" aria-hidden="true" />
      </div>
      <Image
        src="/herder_logo_text_green.png"
        alt="Herder"
        width={290}
        height={70}
        className={`h-auto w-[9.75rem] flex-shrink-0 object-contain sm:w-[10.5rem] ${textClassName}`.trim()}
      />
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`flex items-center ${gapClassName} ${className}`.trim()}>
        {content}
      </Link>
    );
  }

  return <div className={`flex items-center ${gapClassName} ${className}`.trim()}>{content}</div>;
}