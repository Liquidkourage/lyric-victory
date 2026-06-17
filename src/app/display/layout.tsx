export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="display-stage fixed inset-0 overflow-hidden text-[clamp(18px,1.15vw,22px)]">
      {children}
    </div>
  );
}
