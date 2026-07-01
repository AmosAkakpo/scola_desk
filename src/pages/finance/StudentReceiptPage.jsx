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

  // selectedFees: { [fee_type_id]: amountString }
  const [selectedFees, setSelectedFees] = useState({})
  const [amountReceived, setAmountReceived] = useState('')
  const [method, setMethod] = useState('especes')
  const [payerName, setPayerName] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastResult, setLastResult] = useState(null)
  const [printModal, setPrintModal] = useState(null) // { type: 'receipt'|'statement', data }

  useEffect(() => {
    if (!printModal) return
    const style = document.createElement('style')
    style.id = 'scola-print-style'
    style.textContent = '@media print { body > * { visibility: hidden !important; } #scola-print-content, #scola-print-content * { visibility: visible !important; } #scola-print-content { position: fixed !important; top: 0; left: 0; width: 100%; } }'
    document.head.appendChild(style)
    return () => { document.getElementById('scola-print-style')?.remove() }
  }, [printModal])

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

  // Reset fee selections when data reloads
  useEffect(() => { setSelectedFees({}) }, [studentId])

  const totalSelected = useMemo(() => {
    return Object.values(selectedFees).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
  }, [selectedFees])

  const changeToReturn = useMemo(() => {
    const received = parseFloat(amountReceived) || 0
    return Math.max(0, received - totalSelected)
  }, [amountReceived, totalSelected])

  function toggleFee(fee) {
    setSelectedFees(prev => {
      if (prev[fee.fee_type_id] !== undefined) {
        const next = { ...prev }
        delete next[fee.fee_type_id]
        return next
      }
      return { ...prev, [fee.fee_type_id]: String(fee.remaining) }
    })
  }

  function setFeeAmount(feeTypeId, value, max) {
    setSelectedFees(prev => {
      const num = parseFloat(value)
      const capped = !isNaN(num) && num > max ? String(max) : value
      return { ...prev, [feeTypeId]: capped }
    })
  }

  async function handlePay(andPrint) {
    const fees = Object.entries(selectedFees)
      .map(([fee_type_id, amount]) => ({ fee_type_id: parseInt(fee_type_id), amount: parseFloat(amount) || 0 }))
      .filter(f => f.amount > 0)

    if (fees.length === 0) { setError('Sélectionnez au moins un frais et entrez un montant'); return }

    const received = parseFloat(amountReceived) || 0
    if (received <= 0) { setError('Entrez le montant remis par le parent'); return }

    setSaving(true); setError('')
    try {
      const res = await api.post(`/api/finance/tuition/${studentId}/pay`, {
        fees,
        amount_received: received,
        payment_method: method,
        payer_name: payerName || null,
        reference: reference || null,
        notes: notes || null,
      })
      setLastResult(res.data)
      setSelectedFees({})
      setAmountReceived('')
      setPayerName('')
      setReference('')
      setNotes('')
      load()
      if (andPrint) printReceipt(res.data.payment.id)
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
      setPrintModal({ type: 'receipt', data: res.data })
    })
  }

  function printStatement() {
    api.get(`/api/finance/receipt/statement/${studentId}`).then(res => {
      setPrintModal({ type: 'statement', data: res.data })
    })
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!data) return <p className="text-steel-400 text-sm text-center py-12">Élève introuvable</p>

  const optionalFees = selections.filter(s => !s.is_mandatory && !s.is_system)
  const payableFees = data.fees.filter(f => f.remaining > 0)
  const hasSelection = Object.keys(selectedFees).length > 0

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

      {/* Fee breakdown with selection */}
      <section className="bg-white rounded-xl border border-steel-200 overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-steel-200 bg-steel-50 flex items-center justify-between">
          <h2 className="text-sm font-medium text-steel-700">Frais</h2>
          {payableFees.length > 0 && (
            <button
              onClick={() => {
                if (Object.keys(selectedFees).length === payableFees.length) {
                  setSelectedFees({})
                } else {
                  const all = {}
                  payableFees.forEach(f => { all[f.fee_type_id] = String(f.remaining) })
                  setSelectedFees(all)
                }
              }}
              className="text-xs text-brand hover:text-brand-600"
            >
              {Object.keys(selectedFees).length === payableFees.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-100">
              <th className="w-8 px-3 py-2"></th>
              <th className="text-left px-3 py-2 text-steel-500 font-medium text-xs">Frais</th>
              <th className="text-right px-3 py-2 text-steel-500 font-medium text-xs">Montant</th>
              <th className="text-right px-3 py-2 text-steel-500 font-medium text-xs">Payé</th>
              <th className="text-right px-3 py-2 text-steel-500 font-medium text-xs">Reste</th>
              <th className="text-right px-3 py-2 text-steel-500 font-medium text-xs w-32">À payer</th>
            </tr>
          </thead>
          <tbody>
            {data.fees.map(f => {
              const isSelected = selectedFees[f.fee_type_id] !== undefined
              const isPaid = f.remaining <= 0
              return (
                <tr key={f.fee_type_id} className={`border-b border-steel-50 ${isSelected ? 'bg-brand-50/40' : ''}`}>
                  <td className="px-3 py-2 text-center">
                    {!isPaid && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleFee(f)}
                        className="rounded border-steel-300 text-brand focus:ring-brand"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-steel-800">{f.name}</td>
                  <td className="px-3 py-2 text-right text-steel-700">{formatXOF(f.amount_due)}</td>
                  <td className="px-3 py-2 text-right text-steel-700">{formatXOF(f.amount_paid)}</td>
                  <td className="px-3 py-2 text-right text-steel-700">{formatXOF(f.remaining)}</td>
                  <td className="px-3 py-2 text-right">
                    {isPaid ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-50 text-brand-600">Soldé</span>
                    ) : isSelected ? (
                      <input
                        type="number"
                        min="1"
                        max={f.remaining}
                        value={selectedFees[f.fee_type_id]}
                        onChange={e => setFeeAmount(f.fee_type_id, e.target.value, f.remaining)}
                        className="w-28 px-2 py-1 border border-brand rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-brand bg-white"
                      />
                    ) : (
                      <span className="text-steel-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-steel-50 font-semibold">
              <td></td>
              <td className="px-3 py-2.5 text-steel-800">TOTAL</td>
              <td className="px-3 py-2.5 text-right text-steel-800">{formatXOF(data.summary.totalDue)}</td>
              <td className="px-3 py-2.5 text-right text-steel-800">{formatXOF(data.summary.totalPaid)}</td>
              <td className="px-3 py-2.5 text-right text-steel-800">{formatXOF(data.summary.remaining)}</td>
              <td className="px-3 py-2.5 text-right text-brand font-bold">
                {hasSelection ? formatXOF(totalSelected) : '—'}
              </td>
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
      {data.summary.remaining > 0 && (
        <section className="bg-white rounded-xl border border-steel-200 p-4 mb-4">
          <h2 className="text-sm font-medium text-steel-700 mb-3">Enregistrer un paiement</h2>

          {!hasSelection && (
            <p className="text-xs text-steel-400 mb-3">Cochez les frais à régler dans le tableau ci-dessus.</p>
          )}

          {hasSelection && (
            <div className="bg-steel-50 rounded-lg border border-steel-200 p-3 mb-3 text-sm space-y-1">
              {Object.entries(selectedFees).map(([feeTypeId, amt]) => {
                const fee = data.fees.find(f => f.fee_type_id === parseInt(feeTypeId))
                if (!fee) return null
                const num = parseFloat(amt) || 0
                return (
                  <div key={feeTypeId} className="flex items-center justify-between text-xs">
                    <span className="text-steel-600">{fee.name}</span>
                    <span className="text-steel-800 font-medium">{formatXOF(num)}</span>
                  </div>
                )
              })}
              <div className="border-t border-steel-200 pt-1 mt-1 flex items-center justify-between font-semibold text-xs">
                <span className="text-steel-700">Total à enregistrer</span>
                <span className="text-steel-900">{formatXOF(totalSelected)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Montant remis par le parent *</label>
              <input
                type="number"
                min="1"
                value={amountReceived}
                onChange={e => setAmountReceived(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand"
                placeholder="Ex: 80 000"
              />
              {parseFloat(amountReceived) > 0 && changeToReturn > 0 && (
                <p className="text-xs text-orange-600 mt-1 font-medium">Monnaie à rendre : {formatXOF(changeToReturn)}</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Mode de paiement</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
                {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

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

          <div className="flex gap-2">
            <button
              onClick={() => handlePay(false)}
              disabled={saving || !hasSelection}
              className="flex-1 py-2.5 border border-brand text-brand hover:bg-brand-50 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer sans imprimer'}
            </button>
            <button
              onClick={() => handlePay(true)}
              disabled={saving || !hasSelection}
              className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer et imprimer'}
            </button>
          </div>
        </section>
      )}

      {/* Last result confirmation */}
      {lastResult && (
        <section className="bg-brand-50 rounded-xl border border-brand-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-brand">Paiement enregistré</p>
              <p className="text-xs text-brand/70">
                Reçu N° {lastResult.payment.receipt_number} — {formatXOF(lastResult.amount_recorded)}
                {lastResult.change_to_return > 0 && ` — Monnaie rendue : ${formatXOF(lastResult.change_to_return)}`}
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
                  <p className="text-[10px] text-steel-400">
                    {new Date(p.payment_date).toLocaleDateString('fr-FR')} — {p.receipt_number} — {p.payer_name || '—'}
                  </p>
                  {p.allocations?.length > 0 && (
                    <p className="text-[10px] text-steel-400">
                      {p.allocations.map(a => `${a.fee_name}: ${formatXOF(a.amount)}`).join(' · ')}
                    </p>
                  )}
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

      {/* Print modal */}
      {printModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPrintModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div id="scola-print-content" className="overflow-auto flex-1 p-6">
              {printModal.type === 'receipt'
                ? <PrintReceipt data={printModal.data} />
                : <PrintStatement data={printModal.data} />}
            </div>
            <div className="flex gap-2 p-4 border-t border-steel-200 shrink-0">
              <button onClick={() => window.print()} className="flex-1 px-3 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
                Imprimer
              </button>
              <button onClick={() => setPrintModal(null)} className="px-3 py-2 border border-steel-200 text-steel-600 hover:bg-steel-50 rounded-lg text-sm transition-colors">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function buildReceiptHTML(data) {
  const school = data.school || {}
  const p = data.data || {}
  const lines = (p.allocations || []).map(a =>
    `<tr><td>${a.fee_name}</td><td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(Math.round(a.amount))} F</td></tr>`
  ).join('')

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
  const lines = (data.fees || []).map(f =>
    `<tr><td>${f.name}</td><td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(Math.round(f.amount_due))} F</td><td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(Math.round(f.amount_paid))} F</td><td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(Math.round(f.remaining))} F</td></tr>`
  ).join('')

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

function PrintReceipt({ data }) {
  const school = data.school || {}
  const p = data.data || {}
  const fmtN = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' F'
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, maxWidth: 360, margin: '0 auto' }}>
      <p style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 16, margin: '0 0 2px' }}>{school.school_name || 'ScolaDesk'}</p>
      <p style={{ textAlign: 'center', fontSize: 10, color: '#666', marginBottom: 16 }}>{school.city || ''}{school.country ? ` — ${school.country}` : ''}</p>
      <hr style={{ borderTop: '1px dashed #ccc', margin: '10px 0' }} />
      <p style={{ fontWeight: 'bold', marginBottom: 4 }}>REÇU DE PAIEMENT</p>
      <p style={{ fontSize: 12, margin: '2px 0' }}>N° : <strong>{p.receipt_number || '—'}</strong></p>
      <p style={{ fontSize: 12, margin: '2px 0' }}>Date : {p.payment_date ? new Date(p.payment_date).toLocaleDateString('fr-FR') : '—'}</p>
      <p style={{ fontSize: 12, margin: '2px 0' }}>Élève : <strong>{p.student_name || '—'}</strong></p>
      <p style={{ fontSize: 12, margin: '2px 0' }}>Classe : {p.classroom_label || '—'} — Matricule : {p.matricule || '—'}</p>
      <hr style={{ borderTop: '1px dashed #ccc', margin: '10px 0' }} />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <tbody>
          {(p.allocations || []).map((a, i) => (
            <tr key={i}>
              <td style={{ padding: '3px 0' }}>{a.fee_name}</td>
              <td style={{ padding: '3px 0', textAlign: 'right' }}>{fmtN(a.amount)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 'bold', borderTop: '2px solid #333' }}>
            <td style={{ paddingTop: 6 }}>TOTAL</td>
            <td style={{ paddingTop: 6, textAlign: 'right' }}>{fmtN(p.amount)}</td>
          </tr>
        </tbody>
      </table>
      <hr style={{ borderTop: '1px dashed #ccc', margin: '10px 0' }} />
      <p style={{ fontSize: 10, color: '#666', margin: '2px 0' }}>Mode : {p.payment_method || '—'}{p.reference ? ` — Réf : ${p.reference}` : ''}</p>
      <p style={{ fontSize: 10, color: '#666', margin: '2px 0' }}>Payé par : {p.payer_name || '—'}</p>
      <p style={{ fontSize: 10, color: '#666', margin: '2px 0' }}>Reçu par : {p.receiver_name || '—'}</p>
      <p style={{ marginTop: 30, textAlign: 'center', fontSize: 9, color: '#999' }}>ScolaDesk — Système de gestion scolaire</p>
    </div>
  )
}

function PrintStatement({ data }) {
  const school = data.school || {}
  const student = data.student || {}
  const summary = data.summary || {}
  const fees = data.fees || []
  const fmtN = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' F'
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, maxWidth: 420, margin: '0 auto' }}>
      <p style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 16, margin: '0 0 2px' }}>{school.school_name || 'ScolaDesk'}</p>
      <p style={{ textAlign: 'center', fontSize: 10, color: '#666', marginBottom: 16 }}>{school.city || ''}{school.country ? ` — ${school.country}` : ''}</p>
      <hr style={{ borderTop: '1px dashed #ccc', margin: '10px 0' }} />
      <p style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: 8 }}>ÉTAT DES FRAIS SCOLAIRES<br /><span style={{ fontWeight: 'normal', fontSize: 11 }}>{student.year_label || ''}</span></p>
      <p style={{ fontSize: 12, margin: '2px 0' }}>Élève : <strong>{student.full_name || '—'}</strong></p>
      <p style={{ fontSize: 12, margin: '2px 0' }}>Matricule : {student.matricule || '—'} — Classe : {student.classroom_label || '—'}</p>
      <hr style={{ borderTop: '1px dashed #ccc', margin: '10px 0' }} />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc' }}>
            <th style={{ textAlign: 'left', padding: '3px 2px' }}>Frais</th>
            <th style={{ textAlign: 'right', padding: '3px 2px' }}>Montant</th>
            <th style={{ textAlign: 'right', padding: '3px 2px' }}>Payé</th>
            <th style={{ textAlign: 'right', padding: '3px 2px' }}>Reste</th>
          </tr>
        </thead>
        <tbody>
          {fees.map((f, i) => (
            <tr key={i}>
              <td style={{ padding: '3px 2px' }}>{f.name}</td>
              <td style={{ padding: '3px 2px', textAlign: 'right' }}>{fmtN(f.amount_due)}</td>
              <td style={{ padding: '3px 2px', textAlign: 'right' }}>{fmtN(f.amount_paid)}</td>
              <td style={{ padding: '3px 2px', textAlign: 'right' }}>{fmtN(f.remaining)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 'bold', borderTop: '2px solid #333' }}>
            <td style={{ paddingTop: 6 }}>TOTAL</td>
            <td style={{ paddingTop: 6, textAlign: 'right' }}>{fmtN(summary.totalDue)}</td>
            <td style={{ paddingTop: 6, textAlign: 'right' }}>{fmtN(summary.totalPaid)}</td>
            <td style={{ paddingTop: 6, textAlign: 'right' }}>{fmtN(summary.remaining)}</td>
          </tr>
        </tbody>
      </table>
      <hr style={{ borderTop: '1px dashed #ccc', margin: '10px 0' }} />
      <p style={{ fontSize: 10, color: '#666' }}>Date : {new Date().toLocaleDateString('fr-FR')}</p>
      <p style={{ marginTop: 30, textAlign: 'center', fontSize: 9, color: '#999' }}>ScolaDesk — Système de gestion scolaire</p>
    </div>
  )
}
