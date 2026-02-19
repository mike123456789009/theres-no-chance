type TncLogoProps = {
  className?: string;
  size?: "default" | "compact";
  decorative?: boolean;
};

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value && value.trim())).join(" ");
}

export function TncLogo({ className, size = "default", decorative = false }: TncLogoProps) {
  const logoClassName = joinClassNames("tnc-unified-logo", size === "compact" ? "tnc-unified-logo--compact" : undefined, className);
  const ariaProps = decorative ? { "aria-hidden": true as const } : { role: "img" as const, "aria-label": "There's No Chance" };

  return (
    <span className={logoClassName} {...ariaProps}>
      <span className="logo-letter red">T</span>
      <span className="logo-letter gold">N</span>
      <span className="logo-letter red">C</span>
    </span>
  );
}
