export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 overflow-hidden bg-background">{children}</div>;
}
