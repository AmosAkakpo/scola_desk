const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, 'student_per_class_data')
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

const HEADERS = ['Nom complet', 'Sexe (M/F)', 'Date de naissance', 'Lieu de naissance', 'Nationalité', 'Redoublant (O/N)', 'Nom du tuteur', 'Relation tuteur', 'Téléphone tuteur']

const LAST_NAMES = ['AGOSSOU','DOSSOU','AHOUANDJINOU','HOUNSOU','KIKI','BOKO','SOGLO','ZINSOU','ADJOVI','HOUNSA','TOKPO','GBAGUIDI','TOSSOU','GNIMASSOU','BEHANZIN','ADJAKOU','ASSOGBA','SOSSA','PADONOU','HOUNYONOU','KPOSSOU','DAGAN','QUENUM','ZANNOU','GANDJI','AMOUSSOU','MONTCHO','FASSINOU','HOUNKPATIN','AKPLOGAN','VIEYRA','HOUSSOU','DJENONTIN','HOUETO','AISSI','AGBANGLA','AHOUANSOU','CODJO','DJOSSOU','GNONLONFOUN','HOUNTONDJI','KOUKPO','LALEYE','MEDEGAN','NONVIDE','ODJO','SAGBO','TOGBE','VODOUNOU','YESSOUFOU']
const MALE_FIRST = ['Kossi','Fidèle','Aimé','Raoul','Bienvenu','Arnaud','Parfait','Hervé','David','Nestor','Éric','Serge','Ignace','Abel','Crespin','Hugues','Victor','Théodore','Roland','Clément','Félicien','Blaise','Patrick','Gérard','Marcel','Codjo','Sègla','Djidjo','Dah','Ayéna','Comlan','Houéfa','Mensah','Todjinou','Coffi','Sèkpon','Jocelyn','Dansi','Gbètoho','Togbé','Djifa','Ahonon','Sènou','Ibrahim','Moussa','Rachidi','Karim','Aziz','Fawaz','Ismaël']
const FEMALE_FIRST = ['Judith','Estelle','Carmelle','Odile','Martine','Lucienne','Rachelle','Prisca','Florence','Solange','Carmen','Grâce','Rosine','Afi','Nayo','Afiavi','Hansi','Yawa','Sika','Ahui','Alaba','Adjo','Bômi','Ayélé','Nansi','Nonvide','Aminath','Faridath','Mariama','Latifath','Assiba','Ablawa','Djénéba','Akouavi','Houéfa','Sèna','Lara','Fifamè','Dédé','Mawulé']
const CITIES = ['Cotonou','Porto-Novo','Parakou','Abomey-Calavi','Djougou','Bohicon','Natitingou','Kandi','Ouidah','Lokossa','Abomey','Savalou','Comè','Malanville','Nikki','Pobè']
const RELATIONSHIPS = ['Père','Mère','Oncle','Tante','Tuteur légal']
const GUARDIAN_LAST = ['AGOSSOU','DOSSOU','HOUNSOU','KIKI','BOKO','SOGLO','ZINSOU','ADJOVI','TOKPO','GBAGUIDI','GNIMASSOU','BEHANZIN','SOSSA','PADONOU','DAGAN','QUENUM','ZANNOU','GANDJI','AMOUSSOU','MONTCHO','FASSINOU','HOUNKPATIN','VIEYRA','HOUSSOU','DJENONTIN']

let seed = 42
function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
function pick(arr) { return arr[Math.floor(rand() * arr.length)] }
function randDate(minY, maxY) {
  const y = minY + Math.floor(rand() * (maxY - minY + 1))
  const m = String(Math.floor(rand() * 12) + 1).padStart(2, '0')
  const d = String(Math.floor(rand() * 28) + 1).padStart(2, '0')
  return `${d}/${m}/${y}`
}
function randPhone() { return '97' + String(Math.floor(rand() * 1000000)).padStart(6, '0') }

const classes = [
  { file: '6eme_A', sheet: '6ème A', count: 4, birth: [2013, 2014] },
  { file: '6eme_B', sheet: '6ème B', count: 6, birth: [2013, 2014] },
  { file: '5eme_A', sheet: '5ème A', count: 9, birth: [2012, 2013] },
  { file: '5eme_B', sheet: '5ème B', count: 6, birth: [2012, 2013] },
  { file: '4eme_A', sheet: '4ème A', count: 5, birth: [2011, 2012] },
  { file: '4eme_B', sheet: '4ème B', count: 5, birth: [2011, 2012] },
  { file: '3eme_A', sheet: '3ème A', count: 5, birth: [2010, 2011] },
  { file: '3eme_B', sheet: '3ème B', count: 5, birth: [2010, 2011] },
  { file: '2nde_C1', sheet: '2nde C1', count: 5, birth: [2009, 2010] },
  { file: '2nde_C2', sheet: '2nde C2', count: 5, birth: [2009, 2010] },
  { file: '2nde_D1', sheet: '2nde D1', count: 5, birth: [2009, 2010] },
  { file: '2nde_D2', sheet: '2nde D2', count: 5, birth: [2009, 2010] },
  { file: '1ere_C1', sheet: '1ère C1', count: 5, birth: [2008, 2009] },
  { file: '1ere_C2', sheet: '1ère C2', count: 5, birth: [2008, 2009] },
  { file: '1ere_D1', sheet: '1ère D1', count: 5, birth: [2008, 2009] },
  { file: '1ere_D2', sheet: '1ère D2', count: 5, birth: [2008, 2009] },
  { file: 'Tle_C', sheet: 'Tle C', count: 5, birth: [2007, 2008] },
  { file: 'Tle_D1', sheet: 'Tle D1', count: 5, birth: [2007, 2008] },
  { file: 'Tle_D2', sheet: 'Tle D2', count: 5, birth: [2007, 2008] },
]

const usedNames = new Set()
let total = 0

for (const cls of classes) {
  const rows = []
  for (let i = 0; i < cls.count; i++) {
    const isMale = rand() > 0.45
    const gender = isMale ? 'M' : 'F'

    let fullName
    do {
      const last = pick(LAST_NAMES)
      const first = isMale ? pick(MALE_FIRST) : pick(FEMALE_FIRST)
      fullName = `${last} ${first}`
    } while (usedNames.has(fullName))
    usedNames.add(fullName)

    const birthDate = randDate(cls.birth[0], cls.birth[1])
    const birthPlace = rand() > 0.15 ? pick(CITIES) : ''
    const nationality = rand() > 0.92 ? 'Togolaise' : 'Béninoise'
    const redoublant = rand() > 0.85 ? 'O' : 'N'

    const rel = pick(RELATIONSHIPS)
    const isGuardianMale = ['Père', 'Oncle', 'Tuteur légal'].includes(rel)
    const guardianFirst = isGuardianMale ? pick(MALE_FIRST) : pick(FEMALE_FIRST)
    const guardianName = `${pick(GUARDIAN_LAST)} ${guardianFirst}`

    rows.push([fullName, gender, birthDate, birthPlace, nationality, redoublant, guardianName, rel, randPhone()])
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows])
  ws['!cols'] = HEADERS.map(h => ({ wch: h.length < 14 ? 16 : 22 }))
  XLSX.utils.book_append_sheet(wb, ws, cls.sheet)
  XLSX.writeFile(wb, path.join(dir, `${cls.file}.xlsx`))
  total += cls.count
  console.log(`${cls.file}.xlsx - ${cls.count} students`)
}

console.log(`\nTotal: ${total} students across ${classes.length} files`)
