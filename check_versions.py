import json
import urllib.request

packages = [
    ("Django", "6.0.5"),
    ("djangorestframework", "3.17.1"),
    ("psycopg", "3.3.4"),
    ("psycopg-binary", "3.3.4"),
    ("psycopg-c", "3.3.4"),
    ("dj-database-url", "3.1.2"),
    ("pymongo", "4.17.0"),
    ("redis", "7.4.0"),
    ("django-redis", "6.0.0"),
    ("django-cors-headers", "4.9.0"),
    ("celery", "5.6.3"),
    ("django-celery-beat", "2.9.0"),
    ("django-celery-results", "2.6.0"),
    ("whitenoise", "6.12.0"),
    ("Faker", "40.19.1"),
    ("django-filter", "25.2"),
    ("jsonmodels", "2.8.0"),
    ("django-storages", "1.14.6"),
    ("django-crum", "0.7.9"),
    ("uvicorn", "0.48.0"),
    ("channels", "4.3.2"),
    ("openai", "2.38.0"),
    ("slack-sdk", "3.42.0"),
    ("scout-apm", "3.5.3"),
    ("openpyxl", "3.1.5"),
    ("python-json-logger", "4.1.0"),
    ("beautifulsoup4", "4.14.3"),
    ("posthog", "7.15.4"),
    ("cryptography", "48.0.0"),
    ("lxml", "6.1.1"),
    ("boto3", "1.43.14"),
    ("zxcvbn", "4.5.0"),
    ("pytz", "2026.2"),
    ("PyJWT", "2.13.0"),
    ("opentelemetry-api", "1.42.1"),
    ("opentelemetry-sdk", "1.42.1"),
    ("opentelemetry-instrumentation-django", "0.63b1"),
    ("opentelemetry-exporter-otlp", "1.42.1"),
    ("drf-spectacular", "0.29.0"),
    ("nh3", "0.3.5"),
    ("gunicorn", "26.0.0"),
    ("django-debug-toolbar", "6.3.0"),
    ("ruff", "0.15.14"),
    ("pytest", "9.0.3"),
    ("pytest-django", "4.12.0"),
    ("pytest-cov", "7.1.0"),
    ("pytest-xdist", "3.8.0"),
    ("pytest-mock", "3.15.1"),
    ("factory-boy", "3.3.3"),
    ("freezegun", "1.5.5"),
    ("coverage", "7.14.0"),
    ("httpx", "0.28.1"),
    ("requests", "2.34.2"),
]

print(f"{'Package':<45} {'Current':<15} {'Latest':<15} Type")
print("-" * 100)
for pkg, current in packages:
    try:
        url = f"https://pypi.org/pypi/{pkg}/json"
        with urllib.request.urlopen(url, timeout=10) as r:
            data = json.loads(r.read())
        latest = data["info"]["version"]

        # strip pre-release suffixes for comparison
        def parse_ver(v):
            parts = []
            for x in v.replace("b0", "").replace("b", "").split("."):
                if x.isdigit():
                    parts.append(int(x))
            return parts

        c_parts = parse_ver(current)
        l_parts = parse_ver(latest)
        if not c_parts or not l_parts:
            upd = "unknown"
        elif c_parts[0] < l_parts[0]:
            upd = "MAJOR"
        elif len(c_parts) > 1 and len(l_parts) > 1 and c_parts[1] < l_parts[1]:
            upd = "minor"
        elif current == latest:
            upd = "current"
        else:
            upd = "patch"
        print(f"{pkg:<45} {current:<15} {latest:<15} {upd}")
    except Exception as e:
        print(f"{pkg:<45} {current:<15} ERROR: {e}")
