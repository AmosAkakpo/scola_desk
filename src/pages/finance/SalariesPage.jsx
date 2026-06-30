import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

const METHODS = [
  { value: 'especes', label: 'Espèces' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'virement', label: 'Virement' },
  { value: 'autre', label: 'Autre' },
]

function getMonthOptions() {
  const opts = []
  const now = new Date()
  for (let i = -2; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const val = d.toISOString().slice(0, 7)
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    opts.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return opts
}

export default function SalariesPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [showPay, setShowPay] = useState(null)
  const navigate = useNavigate()

  function load() {
    setLoading(true)
    api.get(`/api/finance/salaries?month=${month}`).then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [month])

  const teachers = data?.teachers || []
  const paid = teachers.filter(t => t.entry?.is_paid)
  const unpaid = teachers.filter(t => !t.entry?.is_paid)
  const totalPaid = paid.reduce((s, t) => s + (t.entry?.amount || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Salaires</h1>
          <p className="text-sm text-steel-500 mt-0.5">{paid.length}/{teachers.length} versés — {formatXOF(totalPaid)} ce mois</p>
        </div>
        <button onClick={() => navigate('/finance')} className="px-3 py-2 text-sm text-steel-600 hover:text-steel-800">← Tableau de bord</button>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          {getMonthOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200 bg-steel-50">
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Enseignant</th>
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Matricule</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Montant</th>
                <th className="text-center px-4 py-2.5 text-steel-500 font-medium">Statut</th>
                <th className="text-center px-4 py-2.5 text-steel-500 font-medium w-28"></th>
              </tr>
            </thead>
            <tbody>
              {teachers.map(t => (
                <tr key={t.id} className="border-b border-steel-50">
                  <td className="px-4 py-2.5 text-steel-800 font-medium">{t.full_name}</td>
                  <td className="px-4 py-2.5 text-steel-500 font-mono text-xs">{t.matricule || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-steel-800">{t.entry ? formatXOF(t.entry.amount) : '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {t.entry?.is_paid ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-600">Payé</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-steel-100 text-steel-500">Non payé</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {!t.entry?.is_paid && (
                      <button onClick={() => setShowPay(t)} className="px-2.5 py-1 bg-brand hover:bg-brand-600 text-white rounded text-xs font-medium transition-colors">
                        Payer
                      </button>
                    )}
                    {t.entry?.is_paid && t.entry.receipt_number && (
                      <button onClick={() => printSalaryReceipt(t.entry.id)} className="px-2.5 py-1 border border-steel-200 text-steel-600 hover:bg-steel-50 rounded text-xs font-medium transition-colors">
                        Reçu
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {teachers.length === 0 && (
                <tr><td colSpan="5" className="px-4 py-8 text-center text-steel-400 text-sm">Aucun enseignant actif</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showPay && (
        <PaySalaryModal teacher={showPay} month={month} onClose={() => setShowPay(null)} onPaid={() => { setShowPay(null); load() }} />
      )}
    </div>
  )
}

function printSalaryReceipt(entryId) {
  api.get(`/api/finance/receipt/salary/${entryId}`).then(res => {
    const school = res.data.school || {}
    const d = res.data.data || {}
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reçu ${d.receipt_number}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;max-width:350px;margin:0 auto;padding:20px}
h1{font-size:16px;text-align:center;margin:0 0 4px}.sub{text-align:center;font-size:10px;color:#666;margin-bottom:16px}
.line{border-top:1px dashed #ccc;margin:10px 0}.meta{font-size:10px;color:#666}
@media print{body{padding:0}}</style></head>
<body>
<h1>${school.school_name || 'ScolaDesk'}</h1>
<div class="sub">${school.city || ''} — ${school.country || ''}</div>
<div class="line"></div>
<p><strong>REÇU DE SALAIRE</strong></p>
<p>N°: <strong>${d.receipt_number || ''}</strong></p>
<p>Date: ${d.paid_at ? new Date(d.paid_at).toLocaleDateString('fr-FR') : ''}</p>
<p>Enseignant: <strong>${d.teacher_name || ''}</strong></p>
<p>Matricule: ${d.teacher_matricule || ''}</p>
<p>Mois: ${d.month || ''}</p>
<div class="line"></div>
<p style="font-size:16px;font-weight:bold;text-align:center">${new Intl.NumberFormat('fr-FR').format(Math.round(d.amount || 0))} F</p>
<div class="line"></div>
<p class="meta">Mode: ${d.payment_method || ''} ${d.reference ? '— Réf: ' + d.reference : ''}</p>
<p class="meta">Payé par: ${d.payer_name || school.school_name || '—'}</p>
<p class="meta">Reçu par: ${d.receiver_name || '—'}</p>
<div style="margin-top:30px;text-align:center;font-size:9px;color:#999">ScolaDesk</div>
</body></html>`
    const w = window.open('', '_blank', 'width=400,height=600')
    w.document.write(html)
    w.document.close()
    w.print()
  })
}

function PaySalaryModal({ teacher, month, onClose, onPaid }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('especes')
  const [payerName, setPayerName] = useState('')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const num = parseFloat(amount)
    if (!num || num <= 0) return
    setSaving(true)
    setError('')
    try {
      await api.post('/api/finance/salaries/pay', {
        teacher_id: teacher.id, month, amount: num, salary_type: 'fixed',
        payment_method: method, payer_name: payerName || null, reference: reference || null,
      })
      onPaid()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="p-5 border-b border-steel-200">
          <h2 className="text-lg font-medium text-steel-900">Payer {teacher.full_name}</h2>
          <p className="text-xs text-steel-500">{month}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Montant *</label>
            <input type="number" min="1" required value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Mode de paiement</label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
              {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Nom du payeur</label>
              <input type="text" value={payerName} onChange={e => setPayerName(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="École" />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Référence</label>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Enregistrement...' : 'Payer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
