FROM python:3.12-slim

WORKDIR /app

# Install dependencies
RUN pip install --no-cache-dir \
    flask \
    flask-cors \
    psycopg2-binary \
    scapy

# Copy application
COPY . .

EXPOSE 5000

CMD ["python", "detection_api.py"]
