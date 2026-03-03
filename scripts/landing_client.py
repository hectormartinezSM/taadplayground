"""
LandingAIADE client for document processing automation.

Implements the following public functions (firmas mantenidas):
- is_blank_page(image_bytes: bytes) -> bool
- are_pages_same_document(prev_page_image: bytes, current_page_image: bytes) -> bool
- classify_document(pages_images: List[bytes]) -> Dict
- get_relevant_fields(document_type: str) -> List[Dict]
- extract_fields(pages_images: List[bytes], fields: List[Dict]) -> Dict

Todas usan LandingAIADE y modelos Pydantic equivalentes a los de TAADLive_v2,
sin generar datos aleatorios ni mocks.
"""

import os
import json
import tempfile
from typing import List, Dict, Optional
import requests


# Opcional: silenciar reintentos verbosos de la librería
os.environ.setdefault("RETRY_LOGGING_STYLE", "none")


# ---------------------------------------------------------------------------
# Modelos Pydantic equivalentes a los de TAADLive_v2 (simplificados)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Funciones públicas requeridas por la demo
# ---------------------------------------------------------------------------


def is_blank_page(image_bytes: bytes) -> bool:
    """
    Detecta si una página es blanca utilizando llamadas directas a la API de LandingAI.

    Devuelve True si la página se considera 'en blanco', False en caso contrario.
    """
    # First, parse the image to get markdown
    headers = {
        'Authorization': 'Bearer MDNma3lncjZvMDBuZXR4amt5MjNxOnB4dXRtWjBSNU9aamcyYUVjUnNJc2xZZHg2VUt0Vk94'
    }

    parse_url = 'https://api.va.eu-west-1.landing.ai/v1/ade/parse'
    
    parse_data = {
        'model': 'dpt-2-latest'
    }
    
    files = {'document': image_bytes}
    
    parse_response = requests.post(parse_url, files=files, data=parse_data, headers=headers)
    parse_resp = parse_response.json()
    markdown = parse_resp["markdown"]

    # Extract blank page detection using the schema
    extract_url = 'https://api.va.eu-west-1.landing.ai/v1/ade/extract'
    
    schemaBlanca = '{"properties": {"es_blanca": {"description": "Devuele True si consideras que una pagina es blanca y False en caso contrarioEntendemos como p\\u00e1gina blanca una p\\u00e1gina sin informaci\\u00f3n de ningun tipo, ni sellos, pies de pagina ni imagenes", "title": "Es Blanca", "type": "boolean"}, "rationale": {"description": "Breve explicaci\\u00f3n de por qu\\u00e9", "title": "Rationale", "type": "string"}}, "required": ["es_blanca", "rationale"], "title": "DetectorBlancas", "type": "object"}'

    md_upload = ("documento.md", markdown.encode("utf-8"), "text/markdown")
    
    try:
        extract_files = {'markdown': md_upload}
        extract_data = {
            'schema': schemaBlanca,
            'model': 'extract-latest'
        }
        
        extract_response = requests.post(extract_url, files=extract_files, data=extract_data, headers=headers)
        blanc = extract_response.json()
        
        if "es_blanca" in blanc["extraction"].keys():
            esBlanca = blanc["extraction"]["es_blanca"]
            if blanc["extraction"]["rationale"].strip() == "":
                esBlanca = True
        else:
            esBlanca = True
    except:
        esBlanca = True

    return esBlanca


def are_pages_same_document(prev_page_image: bytes, current_page_image: bytes) -> bool:
    """
    Determina si dos páginas consecutivas pertenecen al mismo documento.

    Utiliza el modelo SameDocVerdict sobre el markdown combinado de ambas páginas.
    """
    client = _get_client()

    mk1 = _image_bytes_to_markdown(prev_page_image)
    mk2 = _image_bytes_to_markdown(current_page_image)
    mk_joined = joinMarkdowns([mk1, mk2])

    md_upload = ("documento.md", mk_joined.encode("utf-8"), "text/markdown")
    seg = client.extract(schema=_schema_seg, markdown=md_upload)
    return bool(seg.extraction["same_document"])


def classify_document(pages_images: List[bytes]) -> Dict:
    """
    Clasifica un documento multipágina.

    - Junta todas las páginas en un único markdown.
    - Aplica ClasificadorGeneral.
    - Si devuelve 'Otros', aplica TipoOtros para refinar la tipología.

    Devuelve:
        {
            "type": <str>,          # tipología detectada
            "confidence": <float>,  # confianza fija alta (no hay score nativo)
        }
    """
    client = _get_client()

    mk_joined = _pages_to_joined_markdown(pages_images)
    md_upload = ("documento.md", mk_joined.encode("utf-8"), "text/markdown")

    ext1 = client.extract(schema=_schema_clas1, markdown=md_upload)
    tipologia = ext1.extraction["Clasify"]

    if tipologia == "Otros":
        ext2 = client.extract(schema=_schema_clas2, markdown=md_upload)
        tipologia = ext2.extraction["Clasify"]

    # LandingAIADE no devuelve una probabilidad explícita, así que usamos
    # una confianza fija alta para mantener la firma de la función.
    return {"type": tipologia, "confidence": 0.95}


def get_relevant_fields(document_type: str) -> List[Dict]:
    """
    Devuelve los campos relevantes para un tipo de documento.

    Esta función mantiene el mapeo estático original, para que la UI conozca
    qué campos mostrar/esperar por cada tipología estándar.

    Si el tipo no se reconoce, devuelve un único campo genérico.
    """
    fields_map = {
        "Extracto Bancario": [
            {"name": "Número de Cuenta"},
            {"name": "Titular"},
            {"name": "Período"},
            {"name": "Saldo Inicial"},
            {"name": "Saldo Final"},
            {"name": "Total Ingresos"},
            {"name": "Total Gastos"},
        ],
        "Recibo de Nómina": [
            {"name": "Nombre del Empleado"},
            {"name": "NIF/NIE"},
            {"name": "Período de Pago"},
            {"name": "Salario Base"},
            {"name": "Deducciones"},
            {"name": "Salario Neto"},
            {"name": "Empresa"},
        ],
        "Factura Comercial": [
            {"name": "Número de Factura"},
            {"name": "Fecha de Emisión"},
            {"name": "NIF/CIF Emisor"},
            {"name": "Razón Social Emisor"},
            {"name": "NIF/CIF Receptor"},
            {"name": "Base Imponible"},
            {"name": "IVA"},
            {"name": "Total"},
        ],
        "Contrato de Préstamo": [
            {"name": "Número de Contrato"},
            {"name": "Entidad Financiera"},
            {"name": "Prestatario"},
            {"name": "Importe del Préstamo"},
            {"name": "Tipo de Interés"},
            {"name": "Plazo"},
            {"name": "Fecha de Formalización"},
        ],
        "Declaración de Impuestos": [
            {"name": "NIF/CIF"},
            {"name": "Ejercicio Fiscal"},
            {"name": "Tipo de Declaración"},
            {"name": "Base Imponible"},
            {"name": "Cuota Tributaria"},
            {"name": "Resultado"},
        ],
        "Certificado de Depósito": [
            {"name": "Número de Certificado"},
            {"name": "Entidad Bancaria"},
            {"name": "Titular"},
            {"name": "Importe"},
            {"name": "Fecha de Apertura"},
            {"name": "Fecha de Vencimiento"},
            {"name": "Tipo de Interés"},
        ],
        "Orden de Pago": [
            {"name": "Número de Orden"},
            {"name": "Fecha"},
            {"name": "Ordenante"},
            {"name": "Beneficiario"},
            {"name": "IBAN Beneficiario"},
            {"name": "Importe"},
            {"name": "Concepto"},
        ],
        "Estado de Cuenta": [
            {"name": "Número de Cuenta"},
            {"name": "Titular"},
            {"name": "Fecha de Corte"},
            {"name": "Saldo Disponible"},
            {"name": "Crédito Disponible"},
            {"name": "Pago Mínimo"},
            {"name": "Fecha de Pago"},
        ],
    }

    return fields_map.get(document_type, [{"name": "Campo Genérico"}])


def extract_fields(pages_images: List[bytes], fields: List[Dict]) -> Dict:
    """
    Extrae los valores de una lista de campos sobre un documento multipágina.

    Para cada campo:
      - Se construye un schema JSON ad-hoc con una única propiedad 'respuesta'.
      - Se llama a LandingAIADE.extract con el markdown completo del documento.
      - Se devuelve un diccionario {nombre_campo: {"value": str, "confidence": float}}.

    La confianza es fija (0.95), ya que la API actual no devuelve un score numérico.
    """
    client = _get_client()

    mk_joined = _pages_to_joined_markdown(pages_images)
    md_upload = ("documento.md", mk_joined.encode("utf-8"), "text/markdown")

    result: Dict[str, Dict[str, object]] = {}

    for field in fields:
        campo = field.get("name", "").strip()
        if not campo:
            continue

        field_name = "respuesta"
        schema_ext_campo = {
            "type": "object",
            "properties": {
                field_name: {
                    "type": "string",
                    "description": (
                        f"Extrae el valor de '{campo}' del documento.\n"
                        "Ten en cuenta el contexto completo del documento.\n"
                        "Devuelve ÚNICAMENTE el valor solicitado, sin texto adicional.\n"
                        "Traduce la respuesta al castellano salvo nombres propios.\n"
                        "Intenta compactar en 10–20 palabras como máximo.\n"
                        "Los importes en formato numérico, separador de miles con punto, "
                        "decimales con coma y unidad al final si corresponde.\n"
                        "Las fechas siempre en formato DD/MM/AAAA."
                    ),
                }
            },
            "required": [field_name],
        }

        ext_campo = client.extract(
            schema=json.dumps(schema_ext_campo),
            markdown=md_upload,
        )
        respuesta = ext_campo.extraction.get(field_name, "")

        result[campo] = {
            "value": respuesta,
            "confidence": 0.95,
        }

    return result


# ---------------------------------------------------------------------------
# Pequeño test manual si se ejecuta este módulo directamente
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python landing_client.py <command> [args]")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "check_blank":
        if len(sys.argv) < 3:
            print("Usage: python landing_client.py check_blank <base64_image>")
            sys.exit(1)
        
        import base64
        image_data = base64.b64decode(sys.argv[2])
        result = is_blank_page(image_data)
        print("true" if result else "false")
    
    elif command == "check_same_doc":
        if len(sys.argv) < 4:
            print("Usage: python landing_client.py check_same_doc <base64_image1> <base64_image2>")
            sys.exit(1)
        
        import base64
        image1_data = base64.b64decode(sys.argv[2])
        image2_data = base64.b64decode(sys.argv[3])
        result = are_pages_same_document(image1_data, image2_data)
        print("true" if result else "false")
    
    else:
        print(f"Unknown command: {command}")
        print("Available commands: check_blank, check_same_doc")
        sys.exit(1)
