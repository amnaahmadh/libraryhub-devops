# LibraryHub: Docker, Docker Compose and Jenkins on AWS EC2

DevOps for Cloud Computing (CSC418), Assignment 2. Amna Ahmad, SP23-BAI-004.

LibraryHub is a three-tier Library Management System (Node.js 22 + Express + EJS, MySQL 8.4) with
user management, a book catalogue, loans with fines, and an admin dashboard. This repository holds
the application code and everything needed to run it in containers on one EC2 instance.

| Path | Purpose |
|---|---|
| `app/` | Application source code |
| `Dockerfile`, `.dockerignore` | **Part I.** Builds the web server image `your-dockerhub-username/libraryhub:1.0` |
| `docker-compose.yml` | **Part I.** Runs the image from Docker Hub with MySQL and a persistent volume |
| `docker-compose.jenkins.yml` | **Part II.** Same stack, code attached as a volume, different names and ports |
| `Jenkinsfile` | **Part II.** Pipeline: Checkout, Build in Docker, Deploy, Smoke test, e-mail |
| `mysql-init/` | Creates the read-only `evaluator` database user on first start |
| `scripts/ec2-setup.sh` | Installs Docker, Docker Compose, Java 21 and Jenkins on Ubuntu |
| `scripts/deploy-part1.sh` | Starts Part I on the EC2 instance |
| `.env.example` | Keys of the secrets file used by both compose files |

## Endpoints on the EC2 instance

| Service | Part I (always up) | Part II (started by Jenkins) |
|---|---|---|
| Web application | `http://<EC2-IP>/` (80 -> 3000) | `http://<EC2-IP>:8081/` (8081 -> 3000) |
| MySQL | `<EC2-IP>:3307` (3307 -> 3306) | `<EC2-IP>:3308` (3308 -> 3306) |
| Containers | `libraryhub-web`, `libraryhub-db` | `libraryhub-ci-web`, `libraryhub-ci-db` |
| Data volume | `libraryhub_mysql-data` | `libraryhub-ci_mysql-data` |
| Jenkins | `http://<EC2-IP>:8080/` | |

Health check: `/health` (JSON, HTTP 200 when the database is connected). `/about` shows the
deployment, the Jenkins build number and commit, and the container that served the request.

Application accounts: `admin@library.com` / `Admin@123` and `member@library.com` / `Member@123`.

## Part I: build, push and run

```bash
docker build -t your-dockerhub-username/libraryhub:1.0 .
docker push your-dockerhub-username/libraryhub:1.0

# on the EC2 instance
bash scripts/ec2-setup.sh
DB_READONLY_PASSWORD=<password> bash scripts/deploy-part1.sh    # writes .env, then docker compose up -d
```

Database integration can be checked with the read-only account `evaluator` (SELECT on `library_db`
only), e.g. `mysql -h <EC2-IP> -P 3307 -u evaluator -p library_db`.

## Part II: CI/CD

A push to `main` triggers the GitHub webhook `http://<EC2-IP>:8080/github-webhook/`. Jenkins checks
out the code, runs `npm ci` inside a `node:22-alpine` container, brings the stack up with
`docker-compose.jenkins.yml`, checks `/health` and e-mails the result to the collaborator who pushed.

To take the Part II deployment down again:

```bash
docker compose -p libraryhub-ci down
```
