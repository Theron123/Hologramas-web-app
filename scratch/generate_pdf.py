import os
from fpdf import FPDF

class BusinessPDF(FPDF):
    def header(self):
        # Title band
        self.set_fill_color(30, 27, 75) # Deep blue (#1e1b4b)
        self.rect(0, 0, 210, 35, 'F')
        
        self.set_text_color(255, 255, 255)
        self.set_font('Helvetica', 'B', 15)
        self.cell(0, 10, "ESTUDIO DE COSTES Y VIABILIDAD TECNICA", align='C')
        self.ln(8)
        self.set_font('Helvetica', '', 10)
        self.cell(0, 5, "Proyecto Hologramas IA (Herramienta Interna y Privada)", align='C')
        self.ln(15)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f"Pagina {self.page_no()}/{{nb}} - Confidencial Interno", align='C')

def generate_pdf():
    pdf = BusinessPDF()
    pdf.alias_nb_pages()
    pdf.add_page()
    pdf.set_margins(15, 38, 15)
    pdf.set_auto_page_break(auto=True, margin=15)
    
    # Context section
    pdf.set_text_color(30, 27, 75)
    pdf.set_font('Helvetica', 'B', 12)
    pdf.cell(0, 8, "1. Contexto de Operacion y Volumen Estimado")
    pdf.ln(8)
    
    pdf.set_text_color(50, 50, 50)
    pdf.set_font('Helvetica', '', 9.5)
    context_text = (
        "Este informe detalla el analisis de costes y viabilidad de la arquitectura para el procesamiento "
        "y renderizado de imagenes a hologramas 3D. Al tratarse de una herramienta privada de control interno "
        "(y no de cara al publico), la escala de uso se reduce a operadores internos. Se proyecta un uso estimado de "
        "15 productos por dia laborable (~300 productos procesados al mes)."
    )
    pdf.multi_cell(0, 5, context_text)
    pdf.ln(5)
    
    # Table Header
    pdf.set_font('Helvetica', 'B', 9.5)
    pdf.set_fill_color(30, 27, 75)
    pdf.set_text_color(255, 255, 255)
    
    # Column Widths: Component (40), Role (65), License/Unit (45), Cost/Month (30)
    widths = [38, 62, 45, 35]
    headers = ["Componente", "Rol en el Proyecto", "Licencia / Unidad", "Coste / Mes (300)"]
    
    for w, h in zip(widths, headers):
        pdf.cell(w, 8, h, border=1, align='C', fill=True)
    pdf.ln()
    
    # Table Rows
    rows = [
        ["Google Gemini 2.5 Flash", "IA 1a: Analisis e identificacion visual", "Gratis (limite 15 RPM)", "$0.00 USD"],
        ["Fal.ai (SAM 2)", "IA 1b: Recorte exacto y quitar fondo", "$0.005 por imagen", "$1.50 USD (~800 CRC)"],
        ["Fal.ai (Trellis 3D)", "IA 2: Generar malla 3D (.glb)", "$0.05 por render 3D", "$15.00 USD (~8,000 CRC)"],
        ["Three.js / Fiber", "Visualizacion y sombreador de hologramas", "Gratis (Licencia MIT)", "$0.00 USD (Gratis)"],
        ["Hosting", "Servidor local o Vercel Hobby", "Capa Gratis / Servidor propio", "$0.00 USD (Gratis)"]
    ]
    
    pdf.set_text_color(50, 50, 50)
    pdf.set_font('Helvetica', '', 8.5)
    for index, row in enumerate(rows):
        fill = (index % 2 == 1)
        pdf.set_fill_color(240, 243, 248) # Alternate light grayish-blue
        pdf.cell(widths[0], 8, row[0], border=1, fill=fill)
        pdf.cell(widths[1], 8, row[1], border=1, fill=fill)
        pdf.cell(widths[2], 8, row[2], border=1, fill=fill, align='C')
        pdf.cell(widths[3], 8, row[3], border=1, fill=fill, align='R')
        pdf.ln()
        
    # Totals Row
    pdf.set_font('Helvetica', 'B', 9.5)
    pdf.set_text_color(30, 27, 75)
    pdf.cell(widths[0] + widths[1] + widths[2], 8, "TOTAL ESTIMADO MENSUAL (300 usos)", border=1, align='R')
    pdf.cell(widths[3], 8, "$16.50 USD", border=1, align='R')
    pdf.ln()
    pdf.cell(widths[0] + widths[1] + widths[2], 8, "TOTAL PROYECTADO ANUAL (3,600 usos)", border=1, align='R')
    pdf.cell(widths[3], 8, "$198.00 USD", border=1, align='R')
    pdf.ln(10)
    
    # Advantages Section
    pdf.set_font('Helvetica', 'B', 12)
    pdf.cell(0, 8, "2. Ventajas Clave para la Empresa")
    pdf.ln(8)
    pdf.set_font('Helvetica', '', 9.5)
    pdf.set_text_color(50, 50, 50)
    
    bullet_style = '- '
    adv1 = (
        "Sin Costes Fijos/Fantasmas: Operar bajo un modelo puro de pago por uso significa que "
        "en meses de nula o baja actividad (vacaciones, bajas de inventario), el coste baja automaticamente "
        "a $0.00 USD. No hay suscripciones mensuales forzadas."
    )
    adv2 = (
        "Privacidad de Datos Corporativos: Al usar las llaves pagadas (pay-as-you-go) de Google Gemini, "
        "los terminos comerciales garantizan que las imagenes y datos de los productos procesados no se "
        "utilizan para entrenar modelos publicos, protegiendo la confidencialidad de la empresa."
    )
    adv3 = (
        "Seguridad Interna Simplificada: Dado que es una herramienta privada, toda la base de datos de auditoria "
        "y el registro de productos se almacena de forma local y segura en la intranet corporativa, evitando "
        "exposiciones a la red publica."
    )
    
    for adv in [adv1, adv2, adv3]:
        # Bullet layout
        pdf.set_font('Helvetica', 'B', 9.5)
        pdf.write(5, bullet_style)
        pdf.set_font('Helvetica', 'B', 9.5)
        pdf.write(5, adv.split(': ')[0] + ": ")
        pdf.set_font('Helvetica', '', 9.5)
        pdf.write(5, adv.split(': ')[1] + "\n\n")
    
    pdf.ln(2)
    
    # Guarantee Section
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(30, 27, 75)
    pdf.cell(0, 8, "3. Garantia de Viabilidad Tecnica (Pipeline Completo)")
    pdf.ln(8)
    pdf.set_font('Helvetica', '', 9.5)
    pdf.set_text_color(50, 50, 50)
    
    guar_intro = (
        "La viabilidad de esta arquitectura esta garantizada tecnicamente en base a la integracion de modelos "
        "actuales especializados y complementarios:"
    )
    pdf.multi_cell(0, 5, guar_intro)
    pdf.ln(3)
    
    steps = [
        ("1. Analisis y Paleta de Colores (Google Gemini 2.5 Flash):", 
         " Identifica el tipo de producto y extrae la paleta exacta de colores (HEX) que luego el visualizador utiliza para pintar el haz holografico."),
        ("2. Extraccion de Pixeles y Silueta (Fal.ai SAM 2):", 
         " Ajsla el objeto de fondo con precision quirurgica, entregando el recorte con transparencia necesario para construir el volumen."),
        ("3. Modelado 3D y Textura (Fal.ai Trellis):", 
         " Toma el recorte de pixeles y genera un archivo de malla 3D (.glb) texturizado en 35 segundos, listo para cargar en Three.js."),
        ("4. Sombreador e Interactividad (Three.js / React Three Fiber):", 
         " El navegador del cliente renderiza el modelo con efectos holograficos. Si la malla 3D sigue cargando, el sistema mapea los pixeles a una nube de puntos 2.5D instantanea.")
    ]
    
    for title, desc in steps:
        pdf.set_font('Helvetica', 'B', 9.5)
        pdf.write(5, title)
        pdf.set_font('Helvetica', '', 9.5)
        pdf.write(5, desc + "\n\n")
        
    # Signature / Footer Note
    pdf.ln(5)
    pdf.set_font('Helvetica', 'I', 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 5, "Informe de viabilidad preparado para la revision de gerencia.", align='C')

    # Output file
    output_path = os.path.abspath("costes_y_viabilidad_hologramas.pdf")
    pdf.output(output_path)
    print(f"PDF successfully generated at: {output_path}")

if __name__ == "__main__":
    generate_pdf()
