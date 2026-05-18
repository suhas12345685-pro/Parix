interface Props {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export function StatCard({ label, value, sub, color = "text-white" }: Props) {
  return (
    <div className="card">
      <div className="text-sm font-medium text-[#9d91ad]">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-sm text-[#9d91ad]">{sub}</div>}
    </div>
  );
}
