import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

function formatXOF(n) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' F'
}

export default function FinanceSettingsPage() {
  const [tab, setTab] = useState('fees')
  const navigate = useNavigate()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Paramètres financiers</h1>
          <p className="text-sm text-steel-500 mt-0.5">Types de frais et catégories de dépenses</p>
        </div>
        <button onClick={() => navigate('/finance')} className="px-3 py-2 text-sm text-steel-600 hover:text-steel-800">← Tableau de bord</button>
      </div>

      <div className="flex gap-1 border-b border-steel-200 mb-6">
        {[
          { key: 'fees', label: 'Frais scolaires' },
          { key: 'categories', label: 'Catégories dépenses' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-brand text-brand' : 'border-transparent text-steel-500 hover:text-steel-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'fees' && <FeeTypesPanel />}
      {tab === 'categories' && <ExpenseCategoriesPanel />}
    </div>
  )
}

function FeeTypesPanel() {
  const [feeTypes, setFeeTypes] = useState([])
  const [levels, setLevels] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)

  function load() {
    api.get('/api/finance/fee-types').then(res => {
      setFeeTypes(res.data.fee_types || [])
      setLevels(res.data.levels || [])
    })
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id) {
    if (!confirm('Supprimer ce type de frais ?')) return
    try {
      await api.delete(`/api/finance/fee-types/${id}`)
      load()
    } catch (err) {
      if (err.response?.data?.error === 'SYSTEM_FEE') alert('Ce frais système ne peut pas être supprimé.')
    }
  }

  function getDefaultAmount(ft) {
    const def = (ft.amounts || []).find(a => a.level_id === null)
    return def?.amount
  }

  function getLevelCount(ft) {
    return (ft.amounts || []).filter(a => a.level_id !== null).length
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-steel-500">{feeTypes.length} type(s) de frais</p>
        <button onClick={() => setShowAdd(true)} className="px-3 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
          + Ajouter un frais
        </button>
      </div>

      <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-200 bg-steel-50">
              <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Nom</th>
              <th className="text-center px-4 py-2.5 text-steel-500 font-medium">Montant</th>
              <th className="text-center px-4 py-2.5 text-steel-500 font-medium">Obligatoire</th>
              <th className="text-center px-4 py-2.5 text-steel-500 font-medium">Ordre</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {feeTypes.map(ft => (
              <tr key={ft.id} className="border-b border-steel-50">
                <td className="px-4 py-2.5">
                  <span className="text-steel-800 font-medium">{ft.name}</span>
                  {ft.is_system === 1 && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">Système</span>}
                </td>
                <td className="px-4 py-2.5 text-center text-steel-800">
                  {getDefaultAmount(ft) != null ? formatXOF(getDefaultAmount(ft)) : '—'}
                  {getLevelCount(ft) > 0 && <span className="ml-1 text-[10px] text-steel-400">+{getLevelCount(ft)} niveau(x)</span>}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ft.is_mandatory ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-500'}`}>
                    {ft.is_mandatory ? 'Oui' : 'Non'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center text-steel-500 text-xs">{ft.display_order}</td>
                <td className="px-2 py-2.5 text-center flex gap-1 justify-center">
                  <button onClick={() => setEditing(ft)} className="text-steel-400 hover:text-brand text-xs">✏</button>
                  {!ft.is_system && <button onClick={() => handleDelete(ft.id)} className="text-steel-400 hover:text-red-500 text-xs">×</button>}
                </td>
              </tr>
            ))}
            {feeTypes.length === 0 && (
              <tr><td colSpan="5" className="px-4 py-8 text-center text-steel-400 text-sm">Aucun frais configuré</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && <FeeTypeModal levels={levels} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />}
      {editing && <FeeTypeModal fee={editing} levels={levels} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function FeeTypeModal({ fee, levels, onClose, onSaved }) {
  const isEdit = !!fee
  const isSystem = fee?.is_system === 1

  const [name, setName] = useState(fee?.name || '')
  const [isMandatory, setIsMandatory] = useState(fee?.is_mandatory ?? true)
  const [displayOrder, setDisplayOrder] = useState(fee?.display_order ?? 0)
  const [amounts, setAmounts] = useState(() => {
    const map = {}
    if (fee?.amounts) {
      for (const a of fee.amounts) {
        map[a.level_id === null ? 'default' : a.level_id] = a.amount
      }
    }
    return map
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateAmount(key, val) {
    setAmounts(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    const amountsArr = Object.entries(amounts).filter(([, v]) => v > 0).map(([k, v]) => ({
      level_id: k === 'default' ? null : parseInt(k), amount: parseFloat(v),
    }))
    if (amountsArr.length === 0 && !isSystem) { setError('Au moins un montant requis'); return }

    setSaving(true); setError('')
    try {
      if (isEdit) {
        await api.put(`/api/finance/fee-types/${fee.id}`, { name: name.trim(), is_mandatory: isMandatory ? 1 : 0, display_order: displayOrder, amounts: amountsArr })
      } else {
        await api.post('/api/finance/fee-types', { name: name.trim(), is_mandatory: isMandatory ? 1 : 0, display_order: displayOrder, amounts: amountsArr })
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error === 'DUPLICATE' ? 'Ce frais existe déjà' : 'Erreur')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="p-5 border-b border-steel-200">
          <h2 className="text-lg font-medium text-steel-900">{isEdit ? 'Modifier le frais' : 'Nouveau type de frais'}</h2>
          {isSystem && <p className="text-xs text-blue-600 mt-1">Frais système — seul le libellé est modifiable</p>}
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Nom du frais *</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand"
              placeholder="Ex: Scolarité, Inscription, Tenue..." />
          </div>

          {!isSystem && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-steel-500 mb-1">Type</label>
                <select value={isMandatory ? '1' : '0'} onChange={e => setIsMandatory(e.target.value === '1')}
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
                  <option value="1">Obligatoire</option>
                  <option value="0">Optionnel</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-steel-500 mb-1">Ordre d'affichage</label>
                <input type="number" min="0" value={displayOrder} onChange={e => setDisplayOrder(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
              </div>
            </div>
          )}

          {!isSystem && (
            <div>
              <label className="block text-xs text-steel-500 mb-2">Montants par niveau</label>
              <div className="bg-steel-50 rounded-lg border border-steel-200 p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-steel-600 font-medium w-28">Tous niveaux</span>
                  <input type="number" min="0" value={amounts.default || ''} onChange={e => updateAmount('default', parseInt(e.target.value) || 0)}
                    placeholder="Montant par défaut" className="flex-1 px-3 py-1.5 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand" />
                </div>
                <div className="border-t border-steel-200 pt-2 mt-2">
                  <p className="text-[10px] text-steel-400 mb-2">Montants spécifiques (remplacent le défaut pour ce niveau)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {levels.map(l => (
                      <div key={l.id} className="flex items-center gap-2">
                        <span className="text-xs text-steel-500 w-20 truncate">{l.name}</span>
                        <input type="number" min="0" value={amounts[l.id] || ''} onChange={e => updateAmount(l.id, parseInt(e.target.value) || 0)}
                          placeholder="—" className="flex-1 px-2 py-1.5 border border-steel-200 rounded-lg text-xs bg-white focus:outline-none focus:border-brand" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Enregistrement...' : isEdit ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ExpenseCategoriesPanel() {
  const [categories, setCategories] = useState([])
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    api.get('/api/finance/expense-categories').then(res => setCategories(res.data.categories || []))
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try {
      await api.post('/api/finance/expense-categories', { name: newName.trim(), description: newDesc.trim() || null })
      setNewName(''); setNewDesc('')
      load()
    } catch {}
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer cette catégorie ?')) return
    await api.delete(`/api/finance/expense-categories/${id}`)
    load()
  }

  return (
    <div>
      <div className="bg-white rounded-xl border border-steel-200 overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-200 bg-steel-50">
              <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Catégorie</th>
              <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Description</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map(c => (
              <tr key={c.id} className="border-b border-steel-50">
                <td className="px-4 py-2.5 text-steel-800 font-medium">{c.name}</td>
                <td className="px-4 py-2.5 text-steel-500 text-xs">{c.description || '—'}</td>
                <td className="px-2 py-2.5 text-center">
                  {!c.is_system && (
                    <button onClick={() => handleDelete(c.id)} className="text-steel-400 hover:text-red-500 text-sm">×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleAdd} className="bg-white rounded-xl border border-steel-200 p-4 flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-xs text-steel-500 mb-1">Nouvelle catégorie</label>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required
            className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="Nom de la catégorie" />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-steel-500 mb-1">Description</label>
          <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
            className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="Optionnel" />
        </div>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          Ajouter
        </button>
      </form>
    </div>
  )
}
