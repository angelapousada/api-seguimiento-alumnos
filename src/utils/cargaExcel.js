const xlsx = require('xlsx');

const aSiNo = (v) =>
  v != null && String(v).trim().toLowerCase().startsWith('s') ? 'Si' : 'No';

const norm = (v) => (v == null ? '' : String(v).trim());

function buscaCol(row, candidatos) {
  const keys = Object.keys(row);
  for (const cand of candidatos) {
    const lc = cand.toLowerCase();
    const exacta = keys.find((k) => k.toLowerCase() === lc);
    if (exacta) return row[exacta];
    const porPrefijo = keys.find((k) => k.toLowerCase().startsWith(lc));
    if (porPrefijo) return row[porPrefijo];
  }
  return null;
}

function leerHojaConCabecera(sheet, { cabecera = 'DNI' } = {}) {
  const filas = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

  const valorEtiqueta = (etiqueta) => {
    const objetivo = etiqueta.toLowerCase();
    for (const fila of filas) {
      for (let c = 0; c < fila.length; c++) {
        const celda = norm(fila[c]).toLowerCase().replace(/:$/, '');
        if (celda === objetivo) {
          for (let k = c + 1; k < fila.length; k++) {
            if (norm(fila[k]) !== '') return norm(fila[k]);
          }
        }
      }
    }
    return '';
  };

  const meta = {
    plan: valorEtiqueta('plan'),
    asignatura: valorEtiqueta('asignatura'),
    cursoAcademico: valorEtiqueta('curso académico') || valorEtiqueta('curso academico'),
  };

  const objetivo = cabecera.toUpperCase();
  let idxCabecera = filas.findIndex((fila) =>
    fila.some((c) => norm(c).toUpperCase() === objetivo)
  );
  if (idxCabecera < 0) idxCabecera = 0;

  const datos = xlsx.utils.sheet_to_json(sheet, {
    range: idxCabecera,
    defval: null,
    raw: false,
  });

  return { meta, datos, idxCabecera };
}

function recortarNombreGrupo(tipo, valor) {
  if (valor == null) return null;
  const v = String(valor).trim();
  if (!v) return null;
  let corto;
  switch (tipo) {
    case 'Teoría':
      corto = v.replace(/^Clases Expositivas-/i, '');
      break;
    case 'Aula':
      corto = v.replace(/^Prácticas de Aula\//i, '');
      break;
    case 'Laboratorio':
      corto = v.replace(/^Prácticas de Laboratorio-/i, '');
      break;
    case 'Tutoría Grupal':
      corto = v.replace(/^Tutorías Grupales-/i, '');
      break;
    default:
      corto = v;
  }
  corto = corto.trim();
  return corto || v;
}

function parseMatriculados(filePath) {
  const wb = xlsx.readFile(filePath);
  let sheet = wb.Sheets[wb.SheetNames[0]];
  for (const sn of wb.SheetNames) {
    const previa = xlsx.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: '' });
    if (previa.some((f) => f.some((c) => norm(c).toUpperCase() === 'DNI'))) {
      sheet = wb.Sheets[sn];
      break;
    }
  }
  const { meta, datos } = leerHojaConCabecera(sheet, { cabecera: 'DNI' });

  const estudiantes = [];
  for (const row of datos) {
    const dni = norm(buscaCol(row, ['DNI', 'NIF'])) || null;
    const nombre = norm(buscaCol(row, ['Alumno', 'Nombre completo', 'Nombre']));
    if (!dni && !nombre) continue;

    estudiantes.push({
      dni,
      nombre,
      correo: norm(buscaCol(row, ['Email', 'Correo', 'EMAIL'])) || null,
      convocatorias: parseInt(buscaCol(row, ['Convocatorias'])) || 0,
      matriculas: parseInt(buscaCol(row, ['Matrículas', 'Matriculas'])) || 0,
      evaluacion_diferenciada: aSiNo(
        buscaCol(row, ['Evalución Diferenciada', 'Evaluación Diferenciada', 'Evaluacion Diferenciada'])
      ),
      movilidad: aSiNo(buscaCol(row, ['Movilidad Erasmus', 'Movilidad'])),
      necesidades_especiales: aSiNo(
        buscaCol(row, ['Necesidades educativas especiales', 'Necesidades especiales', 'NEE'])
      ),
      grupo_teoria: recortarNombreGrupo('Teoría', buscaCol(row, ['Clases Expositivas', 'Grupo de Teoría', 'Grupo de Teoria'])),
      grupo_laboratorio: recortarNombreGrupo('Laboratorio', buscaCol(row, ['Prácticas de Laboratorio', 'Practicas de Laboratorio', 'Grupo de Prácticas de Laboratorio'])),
      grupo_aula: recortarNombreGrupo('Aula', buscaCol(row, ['Prácticas de Aula', 'Practicas de Aula', 'Grupo de Prácticas de Aula'])),
      grupo_tutoria: recortarNombreGrupo('Tutoría Grupal', buscaCol(row, ['Tutorías Grupales', 'Tutorias Grupales', 'Grupo de Tutorías Grupales'])),
    });
  }

  return {
    nombre: meta.asignatura || '',
    curso: '',
    titulacion: meta.plan || '',
    cursoAcademico: meta.cursoAcademico || '',
    estudiantes,
  };
}

module.exports = { aSiNo, norm, buscaCol, leerHojaConCabecera, parseMatriculados, recortarNombreGrupo };
