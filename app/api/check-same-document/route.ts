import { NextRequest, NextResponse } from 'next/server';

const LANDING_API_KEY = process.env.VISION_AGENT_API_KEY;
const API_BASE_URL = 'https://api.va.eu-west-1.landing.ai';

interface ParseResponse {
  markdown: string;
}

interface ExtractResponse {
  extraction: {
    same_document?: boolean;
    rationale?: string;
  };
}

const parseCache = new Map<string, string>();

async function apiParse(imageBase64: string): Promise<string> {
  // Check cache first
  if (parseCache.has(imageBase64)) {
    console.log('[v0] API: Using cached parse result');
    return parseCache.get(imageBase64)!;
  }

  if (!LANDING_API_KEY) {
    throw new Error('VISION_AGENT_API_KEY environment variable is not configured');
  }

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  
  const formData = new FormData();
  formData.append('document', new Blob([buffer]), 'image.jpg');
  formData.append('model', 'dpt-2-latest');

  const response = await fetch(`${API_BASE_URL}/v1/ade/parse`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LANDING_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 401) {
      throw new Error(`Authentication failed (401). Error: ${errorBody}`);
    }
    throw new Error(`Parse API failed: ${response.status} - ${errorBody}`);
  }

  const data: ParseResponse = await response.json();
  
  // Store in cache
  parseCache.set(imageBase64, data.markdown);
  
  return data.markdown;
}

function joinMarkdowns(markdowns: string[]): string {
  let finalText = '';
  
  for (let i = 0; i < markdowns.length; i++) {
    const newText = `# Página ${i + 1}\n\n${markdowns[i]}\n\n ---\n\n`;
    finalText += newText;
  }
  
  return finalText;
}

async function apiExtract(markdown: string, schema: string): Promise<ExtractResponse> {
  const formData = new FormData();
  formData.append('markdown', new Blob([markdown], { type: 'text/markdown' }), 'documento.md');
  formData.append('schema', schema);
  formData.append('model', 'extract-latest');

  const response = await fetch(`${API_BASE_URL}/v1/ade/extract`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LANDING_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Extract API failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

export async function POST(request: NextRequest) {
  try {
    const { prevImageUrl, currentImageUrl } = await request.json();

    if (!prevImageUrl || !currentImageUrl) {
      return NextResponse.json(
        { error: 'Both prevImageUrl and currentImageUrl are required' },
        { status: 400 }
      );
    }

    console.log('[v0] API: Checking if pages belong to same document...');

    // Parse both pages (will use cache if available)
    const markdownPrev = await apiParse(prevImageUrl);
    const markdownCurr = await apiParse(currentImageUrl);
    
    console.log('[v0] API: Both pages parsed');

    // Join markdowns
    const combinedMarkdown = joinMarkdowns([markdownPrev, markdownCurr]);

    // Schema for same document detection - from the Python script provided
    const schema = JSON.stringify({
      properties: {
        same_document: {
          description: 'Eres un experto en segmentación documental. La segmentación consiste en dividir un fichero multipágina (1..N páginas) en documentos: cada documento es un conjunto de páginas que pertenecen a la misma entidad y forman una unidad completa, sin mezclar páginas de otros documentos.Recibirás un único Markdown combinado con secciones etiquetadas como "# Página 1" y "# Página 2" (texto transcrito de cada página). Tu tarea es decidir si 1 y 2 pertenecen al mismo documento según estas pautas:Conceptos clave: Tipologia Documental -> Se entiene por tipologia documental la categoria de un documento, por ejemplo, una nomina, un DNI, una escritura de compraventa, un modelo tributario, y cualquier otra clase que se nos ocurraContinuidad semantica -> el final de una pagina queda enlazado directamente con el inicio de la siguieteTipologias documentales relevantesDNI:Documento Nacional de Identidad español con foto, número DNI, fecha de caducidad y firma.NIE:Identidad de extranjero en España con letra inicial, número, fecha de caducidad y autoridad.Pasaporte:Pasaporte con país emisor, número, foto, fechas de expedición/caducidad.ID No Español:Documento oficial de identidad extranjero distinto de DNI/NIE, con foto y número.Libro de familia:Libro oficial con inscripciones de matrimonio y nacimientos/hijos.CIF:Identificador fiscal de entidad (NIF de persona jurídica) con razón social.Carnet conducir:Permiso de conducción con número, clases autorizadas, fechas y foto.Certificado de nacimiento:Certificación registral de nacimiento con datos de filiación y fecha.Certificado de matrimonio:Certificación registral de matrimonio con datos de contrayentes y fecha.Certificado de defunción:Certificación registral de fallecimiento con fecha y lugar.Sentencia de divorcio:Resolución judicial de divorcio con partes, fechas y decisión.Certificado de empadronamiento:Certificación municipal de residencia con domicilio y fecha.Volante de empadronamiento:Justificante de residencia municipal (individual o colectivo).Título de propiedad / Escritura de propiedad:Escritura de transmisión de inmueble con partes, fecha y notario.Nota simple:Resumen de situación registral de inmueble con titularidad y cargas.Escritura de compraventa:Contrato público de venta de inmueble con partes, precio y notario.Contrato de arrendamiento:Contrato de alquiler con arrendador, arrendatario, plazo y renta.Recibo de alquiler:Justificante de pago mensual de alquiler con importe y periodo.Seguro de hogar:Póliza de seguro de vivienda con tomador, cobertura y prima.Escritura de hipoteca:Contrato de préstamo hipotecario con prestamista, prestatario, importe y condiciones.Certificado de cancelación de cargas:Certificación de extinción de cargas hipotecarias en el registro.Certificado de eficiencia energética:Certificado de calificación energética del inmueble (A-G).IBI:Recibo del Impuesto sobre Bienes Inmuebles con referencia catastral e importe.Modelo 100:Declaración de IRPF con renta, deducciones, resultado y firma.Modelo 130:Pago fraccionado de IRPF (autónomos) con trimestre e importe.Modelo 303:IVA trimestral con base, cuota, resultado y firma.Modelo 347:Declaración anual de operaciones con terceros.Modelo 190:Resumen anual de retenciones IRPF con declarante y perceptores.Certificado de retenciones:Justificante de retenciones practicadas al contribuyente.Certificado de imputación de rentas:Certificado de rentas inmobiliarias imputadas en IRPF.Certificado de ingresos:Certificación de ingresos anuales con desglose por fuente.Certificado de pagos / anticipos:Justificante de pagos anticipados con concepto e importe.Certificado de estar al corriente de obligaciones tributarias:Certificación de no tener deudas con Hacienda.Justificante de pago de impuestos:Recibo de pago de tributo con concepto e importe.Nómina:Justificante mensual de salario con devengos, deducciones y líquido.Certificado de empresa:Certificación laboral con antigüedad, cargo y salario.Contrato de trabajo:Contrato laboral con partes, puesto, jornada, salario y duración.Vida laboral:Informe oficial de historial de cotización en Seguridad Social.Informe de cotización:Detalle de bases y periodos de cotización con empresa.Certificado de prestaciones:Certificación de prestaciones recibidas (desempleo, incapacidad).Certificado de prestación por desempleo:Justificante de subsidio de desempleo con periodo e importe.Certificado de pensiones:Certificación de pensión (jubilación, invalidez, viudedad) con importe.Justificante de pago de pensiones:Recibo mensual de pensión con concepto e importe.Extracto bancario:Resumen de movimientos de cuenta con fecha, concepto e importe.Certificado de saldo y movimientos:Certificación de saldo medio y movimientos del periodo.Certificado de titularidad de cuenta:Certificación de titulares y firmantes de cuenta.Certificado de productos bancarios:Certificación de cuentas, tarjetas y préstamos en entidad.Contrato de cuenta bancaria:Condiciones de apertura y funcionamiento de cuenta.Recibo de comisiones bancarias:Justificante de comisiones cobradas por servicios.Seguro de vida:Póliza de seguro de vida con tomador, beneficiario y capital asegurado.Seguro de salud:Póliza de seguro médico con tomador, cobertura y prima.Tarjeta sanitaria:Tarjeta de asistencia sanitaria pública con número y titular.Receta médica:Prescripción médica con paciente, medicamento y posología.Volante de derivación:Justificante de derivación a especialista o pruebas.Informe médico:Informe clínico con diagnóstico, tratamiento y pronóstico.Justificante de pago de gastos médicos:Recibo de gasto sanitario con concepto e importe.Factura:Factura de compra/venta con productos, importes, IVA y total.Recibo:Justificante de pago con concepto, importe y pagador/cobrador.Justificante de pago:Comprobante de pago con fecha, concepto e importe.Ticket de compra:Tique de caja con productos, precios e importe total.Contrato de préstamo:Contrato de préstamo con prestamista, prestatario, importe, plazo e interés.Escritura de préstamo hipotecario:Contrato de hipoteca con prestamista, inmueble y condiciones.Contrato de compraventa:Contrato de venta con vendedor, comprador, bien y precio.Contrato de servicios:Contrato de prestación de servicios con partes, objeto y contraprestación.Factura de suministros:Factura de luz, gas, agua, etc. con periodo, consumo e importe.Recibo de comunidad:Cuota mensual de gastos comunes con finca e importe.Justificante de matrícula:Comprobante de matrícula universitaria con curso y precio.Certificado académico:Certificación de estudios cursados con notas y titulación.Título universitario:Diploma oficial de titulación con universidad y especialidad.Certificado de notas:Certificación de calificaciones por asignatura y curso.Matricula de vehículo:Permiso de circulación con matrícula, titular y características.Seguro de coche:Póliza de seguro de vehículo con tomador, matrícula y cobertura.ITV:Certificado de inspección técnica de vehículo con resultado.Recibo de impuesto de circulación:Justificante de pago de tasa municipal de vehículo.Factura de reparación:Factura de taller con trabajos, piezas e importe.Otros:Cualquier otro documento no clasificado en las categorías anteriores.Reglas de Segmentación:1. Tipología Documental Única:Si ambas páginas pertenecen claramente a la misma tipología documental (por ejemplo, ambas son parte de un Extracto Bancario de múltiples páginas o de una Escritura de propiedad extensa) → True.Excepción: Si una tipología documental típicamente es unipágina (DNI, NIE, recibo de alquiler de un mes, nómina de un mes, etc.), páginas separadas suelen ser documentos distintos → False.2. Continuidad Semántica:Si el texto/contenido de la Página 1 finaliza de forma incompleta (frase cortada, tabla que continúa, etc.) y la Página 2 retoma ese contenido → True.Si cada página tiene inicio y cierre propio (encabezados independientes, firmas al final, etc.) → False.3. Coherencia de Identificadores:Si ambas páginas comparten el mismo número de documento/expediente/referencia (por ejemplo, "Escritura nº 123/2024" en ambas) → True.Si tienen números/referencias distintos o ninguna → False (salvo que sea claramente un documento multipágina).4. Formato y Estructura:Si ambas páginas tienen el mismo formato, encabezado corporativo, pie de página con numeración consecutiva (ej: pág. 1 de 5, pág. 2 de 5) → True.Si tienen formatos muy diferentes (una es un certificado oficial sellado y la otra una factura comercial) → False.5. Tipologías Multipágina Típicas:Estas tipologías suelen ser multipágina: Extractos bancarios, escrituras notariales, contratos extensos, declaraciones fiscales complejas, informes médicos largos, certificados de vida laboral completos.En estos casos, si hay coherencia temática y continuidad → True.6. Tipologías Unipágina Típicas:Estas tipologías suelen ser unipágina: DNI, NIE, Pasaporte, Carnet de conducir, recibos simples, facturas individuales, certificados breves.Aunque dos páginas sean del mismo tipo, si son documentos independientes → False.Excepción: Si es evidente que un documento unipágina se digitalizó en varias páginas (por ejemplo, anverso y reverso del DNI en páginas separadas) → True.7. Cambio de Contexto:Si la Página 1 habla de un tema/entidad/fecha y la Página 2 introduce un tema/entidad/fecha completamente distinto sin transición → False.Si hay transición natural (ej: página 1 termina con "…según se detalla en la siguiente hoja" y página 2 continúa esa información) → True.8. En caso de duda:Si no puedes determinar con certeza, aplica una lógica conservadora: si las páginas parecen tener entidad propia (inicio y fin claros), presume False.Si hay indicios claros de continuidad (numeración, referencias cruzadas, contenido enlazado), presume True.Importante:Devuelve True solo si estás razonablemente seguro de que ambas páginas forman parte del mismo documento según las reglas anteriores.Devuelve False si consideras que son documentos independientes o si la evidencia de continuidad es débil.Incluye en rationale una breve justificación de tu decisión (1-2 frases).',
          title: 'Same Document',
          type: 'boolean',
        },
        rationale: {
          description: 'Breve justificación de la decisión (1-2 frases)',
          title: 'Rationale',
          type: 'string',
        },
      },
      required: ['same_document', 'rationale'],
      title: 'SameDocVerdict',
      type: 'object',
    });

    const extractResult = await apiExtract(combinedMarkdown, schema);
    
    console.log('[v0] API: Extraction result:', extractResult);

    let sameDocument = true; // Default to true as in Python script
    
    if (extractResult.extraction && 'same_document' in extractResult.extraction) {
      const same = extractResult.extraction.same_document;
      if (same !== undefined && same !== null) {
        sameDocument = same;
      }
    }

    console.log('[v0] API: Pages belong to same document:', sameDocument);

    return NextResponse.json({ sameDocument });
  } catch (error) {
    console.error('[v0] API: Error checking same document:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to check if pages belong to same document',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
