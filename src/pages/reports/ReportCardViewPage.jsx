import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../utils/api'

export default function ReportCardViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/api/report-cards/view/${id}`).then(res => {
      setSnapshot(res.data.snapshot)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  function handlePrint() { window.print() }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!snapshot) return <p className="text-steel-500 py-20 text-center">Bulletin introuvable</p>

  const d = snapshot
  const sem = d.semester
  const semLabel = `${sem === 1 ? '1er' : sem === 2 ? '2ème' : '3ème'} Trimestre`

  return (
    <div>
      {/* Action bar (hidden on print) */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <button onClick={() => navigate(-1)} className="text-xs text-steel-400 hover:text-steel-600 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Retour
        </button>
        <button onClick={handlePrint} className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          Imprimer
        </button>
      </div>

      {/* Bulletin — A4 portrait */}
      <div className="bg-white mx-auto print:m-0 print:shadow-none shadow-lg" style={{ width: '210mm', minHeight: '297mm', padding: '10mm 12mm', fontSize: '9pt' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-3" style={{ borderBottom: '2px solid #000', paddingBottom: '6px' }}>
          <div className="w-20 h-20 flex items-center justify-center">
            {d.school.logo_path ? (
              <img src={`/api/settings/school-logo`} alt="" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="w-14 h-14 border-2 border-steel-400 rounded-lg flex items-center justify-center">
                <span className="text-steel-400 text-xl font-bold">S</span>
              </div>
            )}
          </div>
          <div className="text-center flex-1 px-4">
            <p className="font-bold text-[8pt] tracking-wide">RÉPUBLIQUE DU BÉNIN</p>
            <p className="font-bold text-[10pt] mt-1">{d.school.section_name || d.school.name}</p>
            <p className="font-bold text-[11pt] mt-2 underline">BULLETIN DE NOTES DU {semLabel.toUpperCase()}</p>
            <p className="text-[8pt] mt-0.5">Année Scolaire {d.academic_year}</p>
          </div>
          <div className="w-20 h-20 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border border-steel-300 rounded-full flex items-center justify-center mx-auto">
                <span className="text-[7pt] text-steel-400">Armoiries</span>
              </div>
            </div>
          </div>
        </div>

        {/* Student Info */}
        <div className="flex gap-4 mb-3 text-[8pt]" style={{ border: '1px solid #ccc', padding: '4px 8px' }}>
          <span><strong>Matricule:</strong> {d.student.matricule || '—'}</span>
          <span><strong>Classe:</strong> {d.classroom.label}</span>
          <span><strong>Nom:</strong> {d.student.full_name}</span>
          <span><strong>Sexe:</strong> {d.student.gender || '—'}</span>
          <span><strong>Effectif:</strong> {d.class_size}</span>
        </div>

        {/* Subject Table */}
        <table className="w-full border-collapse mb-3" style={{ fontSize: '8pt' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th className="border border-steel-400 px-1 py-1 text-left" style={{ width: '25%' }}>Matières</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Moyenne</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Coef</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Moy×Coef</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Rang</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Moy Max</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Moy Min</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Moy Classe</th>
            </tr>
          </thead>
          <tbody>
            {d.subjects.map((sub, i) => (
              <tr key={i}>
                <td className="border border-steel-300 px-1 py-0.5 font-medium">{sub.name}</td>
                <td className="border border-steel-300 px-1 py-0.5 text-center">{sub.raw_average?.toFixed(2) ?? '—'}</td>
                <td className="border border-steel-300 px-1 py-0.5 text-center">{sub.coefficient}</td>
                <td className="border border-steel-300 px-1 py-0.5 text-center font-medium">{sub.weighted_average?.toFixed(2) ?? '—'}</td>
                <td className="border border-steel-300 px-1 py-0.5 text-center">{sub.rank ?? '—'}</td>
                <td className="border border-steel-300 px-1 py-0.5 text-center">{sub.class_highest?.toFixed(2) ?? '—'}</td>
                <td className="border border-steel-300 px-1 py-0.5 text-center">{sub.class_lowest?.toFixed(2) ?? '—'}</td>
                <td className="border border-steel-300 px-1 py-0.5 text-center">{sub.class_average?.toFixed(2) ?? '—'}</td>
              </tr>
            ))}
            {/* Totals row */}
            <tr style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold' }}>
              <td className="border border-steel-400 px-1 py-1">Total</td>
              <td className="border border-steel-400 px-1 py-1 text-center">—</td>
              <td className="border border-steel-400 px-1 py-1 text-center">{d.totals.total_coefficients}</td>
              <td className="border border-steel-400 px-1 py-1 text-center">{d.totals.total_weighted_points?.toFixed(2)}</td>
              <td className="border border-steel-400 px-1 py-1 text-center" colSpan={4}></td>
            </tr>
          </tbody>
        </table>

        {/* Bilan */}
        {d.summary && (
          <div className="mb-3" style={{ border: '1px solid #999', padding: '4px 8px', fontSize: '8pt' }}>
            <div className="flex gap-6">
              <span><strong>Moyenne du trimestre:</strong> {d.summary.semester_average?.toFixed(2) ?? '—'}/20</span>
              <span><strong>Rang:</strong> {d.summary.class_rank ?? '—'}ème/{d.summary.class_size}</span>
              {d.decision?.conduite_score !== null && d.decision?.conduite_score !== undefined && (
                <span><strong>Conduite:</strong> {d.decision.conduite_score}/20</span>
              )}
              {d.summary.mention && <span><strong>Mention:</strong> {d.summary.mention}</span>}
            </div>
          </div>
        )}

        {/* Cross-semester summary */}
        <table className="w-full border-collapse mb-3" style={{ fontSize: '8pt' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th className="border border-steel-400 px-1 py-1 text-left">Bilan</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Moyenne</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Rang</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Moy Max</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Moy Min</th>
            </tr>
          </thead>
          <tbody>
            {d.cross_semesters.map(cs => (
              <tr key={cs.semester}>
                <td className="border border-steel-300 px-1 py-0.5">Bilan {cs.semester === 1 ? '1er' : `${cs.semester}ème`} Trimestre</td>
                <td className="border border-steel-300 px-1 py-0.5 text-center">{cs.average?.toFixed(2) ?? '—'}</td>
                <td className="border border-steel-300 px-1 py-0.5 text-center">{cs.rank ? `${cs.rank}ème/${cs.class_size}` : '—'}</td>
                <td className="border border-steel-300 px-1 py-0.5 text-center">{cs.highest?.toFixed(2) ?? '—'}</td>
                <td className="border border-steel-300 px-1 py-0.5 text-center">{cs.lowest?.toFixed(2) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Sanctions & Congratulations */}
        {d.decision && (
          <div className="grid grid-cols-2 gap-4 mb-3" style={{ fontSize: '8pt' }}>
            <div style={{ border: '1px solid #ccc', padding: '4px 8px' }}>
              <p className="font-bold mb-1">Sanctions</p>
              <p>Avertissement: {d.decision.avertissement ? 'Oui' : 'Non'}</p>
              <p>Blâme: {d.decision.blame ? 'Oui' : 'Non'}</p>
              <p>Exclusion temporaire: {d.decision.exclusion_temporaire ? 'Oui' : 'Non'}</p>
            </div>
            <div style={{ border: '1px solid #ccc', padding: '4px 8px' }}>
              <p className="font-bold mb-1">Félicitations</p>
              <p>Félicitation: {d.decision.felicitation ? 'Oui' : 'Non'}</p>
              <p>Encouragement: {d.decision.encouragement ? 'Oui' : 'Non'}</p>
              <p>Tableau d'honneur: {d.decision.tableau_honneur ? 'Oui' : 'Non'}</p>
            </div>
          </div>
        )}

        {/* Council Decision */}
        <div className="mb-4" style={{ fontSize: '8pt' }}>
          <p><strong>Décision du conseil des professeurs:</strong> {d.decision?.conseil_decision || '___________________________'}</p>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-end mt-6" style={{ fontSize: '8pt' }}>
          <div>
            <p><strong>Cachet et signature du Directeur/rice</strong></p>
            <p className="mt-6">{d.school.director}</p>
          </div>
          <div className="text-right" style={{ fontSize: '7pt', color: '#666' }}>
            <p>Tout bulletin comportant des ratures ou surcharges est nul.</p>
            <p>Seul fait foi le bulletin portant le cachet et la signature du Directeur.</p>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .print\\:hidden { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </div>
  )
}
