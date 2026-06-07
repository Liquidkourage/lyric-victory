export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 overflow-hidden bg-[#faf7f2]">{children}</div>;
}
