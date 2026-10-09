import type { ReactNode } from "react";
import { shortSha } from "../../shared/github";
import type { SourceInfo } from "../../shared/protocol";
import { LogoIcon } from "./Icons";

/** File name plus `owner/repo · ref · directory` context. */
export function SourceTitle({ source, extra }: { source: SourceInfo; extra?: ReactNode }) {
  const dir = source.path.includes("/") ? source.path.slice(0, source.path.lastIndexOf("/")) : "";
  const context = [
    source.repo,
    source.ref ? shortSha(source.ref) : null,
    source.ref ? dirWithoutRef(dir, source.ref) : dir,
  ]
    .filter(Boolean)
    .join(" · ");
  const name = source.htmlUrl ? (
    <a className="xv-title__name" href={source.htmlUrl} target="_blank" rel="noreferrer" title={source.path}>
      {source.fileName}
    </a>
  ) : (
    <span className="xv-title__name" title={source.path}>
      {source.fileName}
    </span>
  );
  return (
    <div className="xv-title">
      {name}
      {(context || extra) && (
        <span className="xv-title__context">
          {context}
          {extra}
        </span>
      )}
    </div>
  );
}

/** `path` sometimes starts with the ref (from `/blob/<ref>/<path>` URLs); don't show it twice. */
function dirWithoutRef(dir: string, ref: string): string {
  if (dir === ref) return "";
  return dir.startsWith(`${ref}/`) ? dir.slice(ref.length + 1) : dir;
}

export function Header({
  title,
  actions,
  compact,
}: {
  title: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header className={`xv-header${compact ? " xv-header--compact" : ""}`}>
      <div className="xv-header__start">
        {!compact && <LogoIcon />}
        {title}
      </div>
      <div className="xv-header__actions">{actions}</div>
    </header>
  );
}
