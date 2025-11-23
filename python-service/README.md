# Python ML Microservice

PDF processing microservice for high-quality PDF to Markdown conversion.

## Features

- PDF → Markdown conversion using marker-pdf
- Structure preservation (headings, tables, lists)
- Optimized with cached models

## Quick Start

### Local Development

**Prerequisites**: Python 3.11+, Poppler, Tesseract OCR

**Windows**:
- Install [Poppler](https://github.com/oschwartz10612/poppler-windows/releases) (add to PATH)
- Install [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki)

**macOS**: `brew install poppler tesseract`

**Linux**: `sudo apt-get install poppler-utils tesseract-ocr`

**Run**:
```bash
cd python-service
pip install -r requirements.txt
python app.py
```

Service: `http://localhost:5000`

### Docker

```bash
docker build -t mindmap-python-service .
docker run -p 5000:5000 mindmap-python-service
```


## API Endpoints

### Health Check
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "service": "python-ml-service",
  "version": "1.0.0"
}
```

### Convert PDF to Markdown
```http
POST /convert-pdf
Content-Type: application/json

{
  "pdf_base64": "JVBERi0xLjQK...",
  "filename": "document.pdf"
}
```

Response:
```json
{
  "success": true,
  "markdown": "# Document Title\n\nContent...",
  "metadata": {
    "pages": 10,
    "chars": 5000,
    "images_extracted": 2
  }
}
```

## Testing

```bash
# Test health endpoint
curl http://localhost:5000/health

# Test PDF conversion (with base64 encoded PDF)
curl -X POST http://localhost:5000/convert-pdf \
  -H "Content-Type: application/json" \
  -d '{"pdf_base64": "..."}'
```

## Performance

- **First request**: ~3-5s (model loading)
- **Subsequent requests**: ~1-3s per page
- **Memory usage**: ~500MB-1GB
