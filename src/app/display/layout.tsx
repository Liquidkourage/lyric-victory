export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return <div className="display-stage fixed inset-0 overflow-hidden">{children}</div>;
}
