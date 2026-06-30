import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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

export default function StudentReceiptPage() {
  const { studentId } = useParams()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [selections, setSelections] = useState([])
  const [loading, setLoading] = useState(true)

  const [amountReceived, setAmountReceived] = useState('')
  const [method, setMethod] = useState('especes')
  const [payerName, setPayerName] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastResult, setLastResult] = useState(null)

  function load() {
    setLoading(true)
    Promise.all([
      api.get(`/api/finance/tuition/${studentId}`),
      api.get(`/api/finance/tuition/${studentId}/fee-selections`),
    ]).then(([tuitionRes, selRes]) => {
      setData(tuitionRes.data)
      setSelections(selRes.data.selections || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [studentId])

  const remaining = data?.summary?.remaining || 0

  const allocationPreview = useMemo(() => {
    const received = parseFloat(amountReceived)
    if (!received || received <= 0 || !data?.fees) return null
    const toRecord = Math.min(received, remaining)
    const change = received - toRecord
    let left = toRecord
    const lines = []
    for (const f of data.fees.filter(f => f.remaining > 0).sort((a, b) => a.display_order - b.display_order)) {
      if (left <= 0) break
      const alloc = Math.min(left, f.remaining)
      lines.push({ name: f.name, amount: alloc, fullyPaid: alloc >= f.remaining })
      left -= alloc
    }
    return { toRecord, change, lines }
  }, [amountReceived, data, remaining])

  async function handlePay() {
    const num = parseFloat(amountReceived)
    if (!num || num <= 0) return
    setSaving(true); setError('')
    try {
      const res = await api.post(`/api/finance/tuition/${studentId}/pay`, {
        amount_received: num, payment_method: method, payer_name: payerName || null, reference: reference || null, notes: notes || null,
      })
      setLastResult(res.data)
      setAmountReceived(''); setPayerName(''); setReference(''); setNotes('')
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'enregistrement')
    }
    setSaving(false)
  }

  async function toggleOptionalFee(feeTypeId, optIn) {
    try {
      await api.put(`/api/finance/tuition/${studentId}/fee-selections`, { fee_type_id: feeTypeId, opted_in: optIn })
      load()
    } catch (err) {
      if (err.response?.data?.error === 'HAS_PAYMENTS') alert('Ce frais a déjà reçu un paiement.')
    }
  }

  function printReceipt(paymentId) {
    api.get(`/api/finance/receipt/payment/${paymentId}`).then(res => {
      const w = window.open('', '_blank', 'width=400,height=600')
      w.document.write(buildReceiptHTML(res.data))
      w.document.close()
      w.print()
    })
  }

  function printStatement() {
    api.get(`/api/finance/receipt/statement/${studentId}`).then(res => {
      const w = window.open('', '_blank', 'width=400,height=600')
      w.document.write(buildStatementHTML(res.data))
      w.document.close()
      w.print()
    })
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!data) return <p className="text-steel-400 text-sm text-center py-12">Élève introuvable</p>

  const optionalFees = selections.filter(s => !s.is_mandatory && !s.is_system)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/finance/tuition')} className="text-xs text-steel-400 hover:text-steel-600 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Retour aux paiements
        </button>
        <button onClick={printStatement} className="px-3 py-1.5 border border-steel-200 text-steel-600 hover:bg-steel-50 rounded-lg text-xs font-medium transition-colors">
          Imprimer état des frais
        </button>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-medium text-steel-900">{data.student.full_name}</h1>
        <p className="text-sm text-steel-500 mt-0.5">
          Matricule: {data.student.matricule || '—'} | Classe: {data.student.classroom_label} | Année: {data.student.year_label}
        </p>
      </div>

      {/* Fee breakdown */}
      <section className="bg-white rounded-xl border border-steel-200 overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-steel-200 bg-steel-50">
          <h2 className="text-sm font-medium text-steel-700">Frais</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-100">
              <th className="text-left px-4 py-2 text-steel-500 font-medium text-xs">Frais</th>
              <th className="text-right px-4 py-2 text-steel-500 font-medium text-xs">Montant</th>
              <th className="text-right px-4 py-2 text-steel-500 font-medium text-xs">Payé</th>
              <th className="text-right px-4 py-2 text-steel-500 font-medium text-xs">Reste</th>
              <th className="text-center px-4 py-2 text-steel-500 font-medium text-xs">Statut</th>
            </tr>
          </thead>
          <tbody>
            {data.fees.map(f => (
              <tr key={f.fee_type_id} className="border-b border-steel-50">
                <td className="px-4 py-2 text-steel-800">{f.name}</td>
                <td className="px-4 py-2 text-right text-steel-700">{formatXOF(f.amount_due)}</td>
                <td className="px-4 py-2 text-right text-steel-700">{formatXOF(f.amount_paid)}</td>
                <td className="px-4 py-2 text-right text-steel-700">{formatXOF(f.remaining)}</td>
                <td className="px-4 py-2 text-center">
                  {f.remaining <= 0
                    ? <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-50 text-brand-600">Soldé</span>
                    : <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-600">Impayé</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-steel-50 font-semibold">
              <td className="px-4 py-2.5 text-steel-800">TOTAL</td>
              <td className="px-4 py-2.5 text-right text-steel-800">{formatXOF(data.summary.totalDue)}</td>
              <td className="px-4 py-2.5 text-right text-steel-800">{formatXOF(data.summary.totalPaid)}</td>
              <td className="px-4 py-2.5 text-right text-steel-800">{formatXOF(data.summary.remaining)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* Optional fees */}
      {optionalFees.length > 0 && (
        <section className="bg-white rounded-xl border border-steel-200 p-4 mb-4">
          <h2 className="text-sm font-medium text-steel-700 mb-3">Frais optionnels</h2>
          <div className="space-y-2">
            {optionalFees.map(f => (
              <label key={f.fee_type_id} className="flex items-center justify-between text-sm cursor-pointer">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={f.opted_in} disabled={!f.can_toggle}
                    onChange={e => toggleOptionalFee(f.fee_type_id, e.target.checked)}
                    className="rounded border-steel-300" />
                  <span className="text-steel-700">{f.name}</span>
                  {f.has_payments && !f.can_toggle && <span className="text-[10px] text-steel-400">(paiement déjà reçu)</span>}
                </div>
                <span className="text-steel-500">{formatXOF(f.amount)}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Payment form */}
      {remaining > 0 && (
        <section className="bg-white rounded-xl border border-steel-200 p-4 mb-4">
          <h2 className="text-sm font-medium text-steel-700 mb-3">Nouveau paiement</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Montant reçu *</label>
              <input type="number" min="1" value={amountReceived} onChange={e => setAmountReceived(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="Montant remis par le parent" />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Mode de paiement</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
                {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {allocationPreview && (
            <div className="bg-steel-50 rounded-lg border border-steel-200 p-3 mb-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-steel-600">Montant à enregistrer</span>
                <span className="font-semibold text-steel-800">{formatXOF(allocationPreview.toRecord)}</span>
              </div>
              {allocationPreview.change > 0 && (
                <div className="flex items-center justify-between mb-2">
                  <span className="text-steel-600">Monnaie à rendre</span>
                  <span className="font-semibold text-orange-600">{formatXOF(allocationPreview.change)}</span>
                </div>
              )}
              <div className="border-t border-steel-200 pt-2 mt-2 space-y-1">
                {allocationPreview.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-steel-500">{l.name}</span>
                    <span className="text-steel-700">{formatXOF(l.amount)} {l.fullyPaid && '→ soldé'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Nom du payeur</label>
              <input type="text" value={payerName} onChange={e => setPayerName(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="Parent / tuteur" />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Référence</label>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="N° transaction (optionnel)" />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-steel-500 mb-1">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="Optionnel" />
          </div>

          {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
          <button onClick={handlePay} disabled={saving || !amountReceived}
            className="w-full py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Enregistrer le paiement'}
          </button>
        </section>
      )}

      {/* Last result */}
      {lastResult && (
        <section className="bg-brand-50 rounded-xl border border-brand-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-brand">Paiement enregistré</p>
              <p className="text-xs text-brand/70">
                Reçu N° {lastResult.payment.receipt_number} — {formatXOF(lastResult.amount_recorded)}
                {lastResult.change_to_return > 0 && ` — Monnaie rendue: ${formatXOF(lastResult.change_to_return)}`}
              </p>
            </div>
            <button onClick={() => printReceipt(lastResult.payment.id)} className="px-3 py-1.5 bg-brand text-white rounded text-xs font-medium hover:bg-brand-600 transition-colors">
              Imprimer reçu
            </button>
          </div>
        </section>
      )}

      {/* Payment history */}
      {data.payments.length > 0 && (
        <section className="bg-white rounded-xl border border-steel-200 p-4">
          <h2 className="text-sm font-medium text-steel-700 mb-3">Historique des paiements</h2>
          <div className="space-y-2">
            {data.payments.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm bg-steel-50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-steel-800 font-medium">{formatXOF(p.amount)}</p>
                  <p className="text-[10px] text-steel-400">{new Date(p.payment_date).toLocaleDateString('fr-FR')} — {p.receipt_number} — {p.payer_name || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-steel-500 capitalize">{p.payment_method?.replace('_', ' ')}</span>
                  <button onClick={() => printReceipt(p.id)} className="text-xs text-brand hover:text-brand-600">Voir reçu</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function buildReceiptHTML(data) {
  const school = data.school || {}
  const p = data.data || {}
  const lines = (p.allocations || []).map(a => `<tr><td>${a.fee_name}</td><td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(Math.round(a.amount))} F</td></tr>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reçu ${p.receipt_number}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;max-width:350px;margin:0 auto;padding:20px}
h1{font-size:16px;text-align:center;margin:0 0 4px}
.sub{text-align:center;font-size:10px;color:#666;margin-bottom:16px}
.line{border-top:1px dashed #ccc;margin:10px 0}
table{width:100%;border-collapse:collapse}td{padding:3px 0}
.total{font-weight:bold;font-size:14px;border-top:2px solid #333;padding-top:6px}
.meta{font-size:10px;color:#666}
@media print{body{padding:0}}</style></head>
<body>
<h1>${school.school_name || 'ScolaDesk'}</h1>
<div class="sub">${school.city || ''} — ${school.country || ''}<br>Code: ${school.school_code || ''}</div>
<div class="line"></div>
<p><strong>REÇU DE PAIEMENT</strong></p>
<p>N°: <strong>${p.receipt_number || ''}</strong></p>
<p>Date: ${p.payment_date ? new Date(p.payment_date).toLocaleDateString('fr-FR') : ''}</p>
<p>Élève: <strong>${p.student_name || ''}</strong></p>
<p>Classe: ${p.classroom_label || ''} — Matricule: ${p.matricule || ''}</p>
<div class="line"></div>
<table>${lines}
<tr class="total"><td>TOTAL</td><td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(Math.round(p.amount || 0))} F</td></tr></table>
<div class="line"></div>
<p class="meta">Mode: ${p.payment_method || ''} ${p.reference ? '— Réf: ' + p.reference : ''}</p>
<p class="meta">Payé par: ${p.payer_name || '—'}</p>
<p class="meta">Reçu par: ${p.receiver_name || '—'}</p>
<div style="margin-top:30px;text-align:center;font-size:9px;color:#999">ScolaDesk — Système de gestion scolaire</div>
</body></html>`
}

function buildStatementHTML(data) {
  const school = data.school || {}
  const student = data.student || {}
  const summary = data.summary || {}
  const lines = (data.fees || []).map(f => `<tr><td>${f.name}</td><td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(Math.round(f.amount_due))} F</td><td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(Math.round(f.amount_paid))} F</td><td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(Math.round(f.remaining))} F</td></tr>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>État des frais</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;max-width:400px;margin:0 auto;padding:20px}
h1{font-size:16px;text-align:center;margin:0 0 4px}
.sub{text-align:center;font-size:10px;color:#666;margin-bottom:16px}
.line{border-top:1px dashed #ccc;margin:10px 0}
table{width:100%;border-collapse:collapse}td,th{padding:4px 2px;text-align:right}td:first-child,th:first-child{text-align:left}
.total{font-weight:bold;border-top:2px solid #333}
.meta{font-size:10px;color:#666}
@media print{body{padding:0}}</style></head>
<body>
<h1>${school.school_name || 'ScolaDesk'}</h1>
<div class="sub">${school.city || ''} — ${school.country || ''}</div>
<div class="line"></div>
<p style="text-align:center"><strong>ÉTAT DES FRAIS SCOLAIRES</strong><br>${student.year_label || ''}</p>
<p>Élève: <strong>${student.full_name || ''}</strong></p>
<p>Matricule: ${student.matricule || ''} — Classe: ${student.classroom_label || ''}</p>
<div class="line"></div>
<table>
<tr><th>Frais</th><th>Montant</th><th>Payé</th><th>Reste</th></tr>
${lines}
<tr class="total"><td>TOTAL</td><td>${new Intl.NumberFormat('fr-FR').format(Math.round(summary.totalDue || 0))} F</td><td>${new Intl.NumberFormat('fr-FR').format(Math.round(summary.totalPaid || 0))} F</td><td>${new Intl.NumberFormat('fr-FR').format(Math.round(summary.remaining || 0))} F</td></tr>
</table>
<div class="line"></div>
<p class="meta">Date: ${new Date().toLocaleDateString('fr-FR')}</p>
<div style="margin-top:30px;text-align:center;font-size:9px;color:#999">ScolaDesk — Système de gestion scolaire</div>
</body></html>`
}
