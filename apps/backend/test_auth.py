import secrets
import requests

BASE = "http://localhost:8000"

email = f"test_{secrets.token_hex(6)}@example.com"
password = secrets.token_urlsafe(16)
name = f"User_{secrets.token_hex(4)}"
role = "interviewer"

print(f"Registering: {email} / {password}")

r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": password, "name": name, "role": role})
print(f"Register {r.status_code}:", r.json())
assert r.status_code == 200, "Registration failed"

r = requests.post(f"{BASE}/auth/login", data={"username": email, "password": password})
print(f"Login    {r.status_code}:", r.json())
assert r.status_code == 200, "Login failed"

token = r.json()["access_token"]
r = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {token}"})
print(f"/me      {r.status_code}:", r.json())
assert r.status_code == 200, "/me failed"

print("\nAll checks passed.")
