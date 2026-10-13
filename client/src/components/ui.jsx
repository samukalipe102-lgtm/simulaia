// Reusable UI primitives.
export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
      <div>
        <h3 className="font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

const STATUS_STYLES = {
  generated: 'bg-slate-100 text-slate-700',
  scheduled: 'bg-indigo-100 text-indigo-700',
  sending: 'bg-amber-100 text-amber-700',
  sent: 'bg-blue-100 text-blue-700',
  awaiting_reply: 'bg-cyan-100 text-cyan-700',
  replied: 'bg-emerald-100 text-emerald-700',
  awaiting_approval: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  paused: 'bg-zinc-200 text-zinc-700',
  error: 'bg-red-100 text-red-700',
  active: 'bg-green-100 text-green-700',
};

const STATUS_LABELS = {
  generated: 'Gerada',
  scheduled: 'Agendada',
  sending: 'Enviando',
  sent: 'Enviada',
  awaiting_reply: 'Aguardando resposta',
  replied: 'Respondida',
  awaiting_approval: 'Aguardando aprovação',
  completed: 'Concluída',
  paused: 'Pausada',
  error: 'Com erro',
  active: 'Ativa',
};

export function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-brand-600 hover:bg-brand-700 text-white',
    secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-800',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    ghost: 'hover:bg-slate-100 text-slate-700',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ label, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>}
      <input
        className={`w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none text-sm ${className}`}
        {...props}
      />
    </label>
  );
}

export function Select({ label, children, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>}
      <select
        className={`w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none text-sm bg-white ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <span
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`}
        />
      </span>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="w-6 h-6 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ children }) {
  return <div className="text-center text-slate-400 py-10 text-sm">{children}</div>;
}

export function FictitiousBanner() {
  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2">
      ⚠️ Ambiente de simulação. Todos os dados são <strong>fictícios</strong> e não representam
      pessoas ou alunos reais.
    </div>
  );
}
