export const StatsCard = ({ label, value, color }) => {
  const colorClasses = {
    green: 'text-green-700',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <p className="text-sm text-slate-600 mb-1">{label}</p>
      <p className={`text-3xl font-bold font-tactical ${colorClasses[color] || 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
};

export default StatsCard;