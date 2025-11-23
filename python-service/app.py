"""
Python Microservice for AI/ML Tasks
- PDF to Markdown conversion using marker-pdf
- Future: Local embeddings generation
"""

import os
import base64
import logging
from io import BytesIO
from flask import Flask, request, jsonify
from flask_cors import CORS
from marker.convert import convert_single_pdf
from marker.models import load_all_models

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Load marker-pdf models on startup (cache for performance)
logger.info("Loading marker-pdf models...")
model_list = load_all_models()
logger.info("Models loaded successfully")


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'python-ml-service',
        'version': '1.0.0'
    }), 200


@app.route('/convert-pdf', methods=['POST'])
def convert_pdf():
    """
    Convert PDF to structured Markdown
    
    Request body:
    {
        "pdf_base64": "base64-encoded PDF content",
        "filename": "optional-filename.pdf"
    }
    
    Response:
    {
        "success": true,
        "markdown": "# Document Title\\n\\nContent...",
        "metadata": {
            "pages": 10,
            "chars": 5000
        }
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'pdf_base64' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing pdf_base64 in request body'
            }), 400
        
        # Decode base64 PDF
        pdf_base64 = data['pdf_base64']
        filename = data.get('filename', 'document.pdf')
        
        try:
            pdf_bytes = base64.b64decode(pdf_base64)
        except Exception as e:
            logger.error(f"Base64 decode error: {e}")
            return jsonify({
                'success': False,
                'error': 'Invalid base64 encoding'
            }), 400
        
        # Convert PDF to Markdown using marker-pdf
        logger.info(f"Converting PDF: {filename} ({len(pdf_bytes)} bytes)")
        
        # Create BytesIO object from PDF bytes
        pdf_file = BytesIO(pdf_bytes)
        
        # Convert using marker-pdf
        # Returns: (markdown_text, metadata_dict)
        markdown_text, images, metadata = convert_single_pdf(
            pdf_file,
            model_list,
            max_pages=None,  # Process all pages
            langs=None,      # Auto-detect language
            batch_multiplier=2
        )
        
        logger.info(f"Conversion successful: {len(markdown_text)} characters, {metadata.get('pages', 0)} pages")
        
        return jsonify({
            'success': True,
            'markdown': markdown_text,
            'metadata': {
                'pages': metadata.get('pages', 0),
                'chars': len(markdown_text),
                'images_extracted': len(images) if images else 0
            }
        }), 200
        
    except Exception as e:
        logger.error(f"PDF conversion error: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f'PDF conversion failed: {str(e)}'
        }), 500


@app.route('/generate-embeddings', methods=['POST'])
def generate_embeddings():
    """
    Generate embeddings locally (placeholder for future implementation)
    
    Request body:
    {
        "texts": ["text1", "text2", ...]
    }
    
    Response:
    {
        "success": true,
        "embeddings": [[0.1, 0.2, ...], [0.3, 0.4, ...]],
        "model": "model-name"
    }
    """
    return jsonify({
        'success': False,
        'error': 'Not implemented yet - use OpenAI embeddings for now'
    }), 501


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    
    logger.info(f"Starting Python ML service on port {port}")
    app.run(host='0.0.0.0', port=port, debug=debug)
