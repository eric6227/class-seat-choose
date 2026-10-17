FROM python:3.11-slim-bookworm

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data && \
    useradd --no-log-init --system --user-group app && \
    chown -R app:app /app

USER app

EXPOSE 8481

ENV DATABASE_URL=sqlite:///./data/seat.db

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8481"]