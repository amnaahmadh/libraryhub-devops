// LibraryHub CI/CD pipeline (Assignment 2, Part II).
//
// Trigger : GitHub webhook http://<EC2-IP>:8080/github-webhook/ on every push to main
// Stages  : Checkout (Git) -> Build inside a node:22-alpine container (Docker Pipeline)
//           -> Deploy with docker-compose.jenkins.yml -> Smoke test -> e-mail the result
// Needs   : plugins Git, Pipeline, Docker Pipeline, GitHub, Email Extension, Credentials Binding;
//           Secret file credential "libraryhub-ci-env" (same keys as .env.example);
//           the jenkins user in the docker group.

pipeline {
    agent any

    triggers {
        githubPush()
    }

    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 10, unit: 'MINUTES')
    }

    environment {
        REPO_URL        = 'https://github.com/amnaahmadh/libraryhub-devops.git'
        BRANCH          = 'main'
        BUILD_IMAGE     = 'node:22-alpine'
        CI_COMPOSE_FILE = 'docker-compose.jenkins.yml'
        APP_PORT        = '8081'
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: env.BRANCH, url: env.REPO_URL
                script {
                    env.GIT_COMMIT_SHORT = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    env.COMMIT_AUTHOR    = sh(script: 'git log -1 --format=%an', returnStdout: true).trim()
                    env.COMMIT_EMAIL     = sh(script: 'git log -1 --format=%ae', returnStdout: true).trim()
                    env.COMMIT_MESSAGE   = sh(script: 'git log -1 --format=%s', returnStdout: true).trim()
                }
                echo "Commit ${env.GIT_COMMIT_SHORT} by ${env.COMMIT_AUTHOR} <${env.COMMIT_EMAIL}>: ${env.COMMIT_MESSAGE}"
            }
        }

        stage('Build in Docker') {
            steps {
                script {
                    // Throw-away Node.js container with the workspace mounted; node_modules is written
                    // to the workspace and later mounted into the application container.
                    docker.image(env.BUILD_IMAGE).inside('-e npm_config_cache=/tmp/.npm') {
                        dir('app') {
                            sh 'node --version && npm --version'
                            sh 'npm ci --omit=dev --no-audit --no-fund'
                            sh 'for f in $(find . -name "*.js" -not -path "./node_modules/*"); do node --check "$f"; done'
                        }
                    }
                }
            }
        }

        stage('Deploy with Docker Compose') {
            steps {
                withCredentials([file(credentialsId: 'libraryhub-ci-env', variable: 'APP_ENV_FILE')]) {
                    sh '''
                        export APP_UID="$(id -u)" APP_GID="$(id -g)"
                        compose() { docker compose -f "$CI_COMPOSE_FILE" --env-file "$APP_ENV_FILE" "$@"; }
                        compose config --quiet
                        compose up -d --wait --wait-timeout 150 db
                        compose up -d --wait --wait-timeout 120 --no-deps --force-recreate web \
                            || { compose logs --tail=80; exit 1; }
                        compose ps
                    '''
                }
                script {
                    def ip = sh(script: 'curl -fsS -m 5 https://checkip.amazonaws.com || true', returnStdout: true).trim()
                    env.APP_URL = "http://${ip ?: 'localhost'}:${env.APP_PORT}/"
                }
            }
        }

        stage('Smoke test') {
            steps {
                sh '''
                    curl -fsS --retry 10 --retry-delay 3 --retry-all-errors "http://localhost:$APP_PORT/health" | tee health.json
                    echo
                    grep -q "$GIT_COMMIT_SHORT" health.json
                    curl -fsS "http://localhost:$APP_PORT/books" | grep -q "LibraryHub"
                '''
                echo "LibraryHub build #${env.BUILD_NUMBER} (${env.GIT_COMMIT_SHORT}) is live at ${env.APP_URL}"
            }
        }
    }

    post {
        always {
            script {
                def recipients = notificationRecipients()
                echo "E-mailing the build result to: ${recipients}"
                emailext(
                    to: recipients,
                    recipientProviders: [developers(), requestor()],
                    subject: "LibraryHub CI #${env.BUILD_NUMBER}: ${currentBuild.currentResult} (${env.GIT_COMMIT_SHORT ?: 'no commit'})",
                    mimeType: 'text/html',
                    body: emailBody(),
                    attachLog: true,
                    compressLog: true
                )
            }
        }
    }
}

// GitHub username -> e-mail address of every repository collaborator (keys in lower case).
// Needed because commits made with GitHub's e-mail privacy setting, the default for commits made
// in the GitHub web UI, only carry an <id>+<username>@users.noreply.github.com address.
@NonCPS
def collaborators() {
    return [
        'amnaahmadh': 'your-email@gmail.com',
        'qasimalik' : 'qasimalik@gmail.com',
    ]
}

@NonCPS
def githubPusher() {
    try {
        def causes = currentBuild.getBuildCauses('com.cloudbees.jenkins.GitHubPushCause')
        // shortDescription is "Started by GitHub push by <username>"
        return causes ? causes[0].shortDescription.tokenize(' ')[-1].toLowerCase() : null
    } catch (err) {
        return null
    }
}

// The collaborator who pushed is identified by the GitHub push event and by the commit's author
// address. If neither resolves to a real address, every collaborator is notified instead.
@NonCPS
def notificationRecipients() {
    def known = collaborators()
    def recipients = []

    def pusher = githubPusher()
    if (pusher && known[pusher]) recipients << known[pusher]

    def author = (env.COMMIT_EMAIL ?: '').trim().toLowerCase()
    if (author.endsWith('@users.noreply.github.com')) {
        def login = author.substring(0, author.indexOf('@'))
        login = login.substring(login.indexOf('+') + 1)
        if (known[login]) recipients << known[login]
    } else if (author) {
        recipients << author
    }

    if (!recipients) recipients = known.collect { login, email -> email }
    return recipients.unique().join(',')
}

@NonCPS
def html(value) {
    return (value ?: '-').toString().replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
}

@NonCPS
def emailBody() {
    def result = currentBuild.currentResult
    def colour = result == 'SUCCESS' ? '#15803d' : '#b91c1c'
    def cause = '-'
    try {
        cause = currentBuild.getBuildCauses()[0].shortDescription
    } catch (err) { }

    def rows = [
        'Job'         : "${env.JOB_NAME} #${env.BUILD_NUMBER}",
        'Result'      : result,
        'Triggered by': cause,
        'Commit'      : "${env.GIT_COMMIT_SHORT ?: '-'}: ${env.COMMIT_MESSAGE ?: '-'}",
        'Author'      : "${env.COMMIT_AUTHOR ?: '-'} <${env.COMMIT_EMAIL ?: '-'}>",
        'Duration'    : currentBuild.durationString.replace(' and counting', ''),
    ].collect { label, value -> "<tr><td><b>${label}</b></td><td>${html(value)}</td></tr>" }.join('\n')

    def app = env.APP_URL ? "<a href=\"${env.APP_URL}\">${env.APP_URL}</a>" : 'not deployed'
    return """<html><body style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1c2333">
<h2 style="color:${colour};margin:0 0 10px">LibraryHub build #${env.BUILD_NUMBER}: ${result}</h2>
<table cellpadding="6" style="border-collapse:collapse">
${rows}
<tr><td><b>Application</b></td><td>${app}</td></tr>
<tr><td><b>Console output</b></td><td><a href="${env.BUILD_URL}console">${env.BUILD_URL}console</a> (log attached)</td></tr>
</table>
<p>Pipeline: Checkout &rarr; Build in Docker &rarr; Deploy with Docker Compose &rarr; Smoke test</p>
</body></html>"""
}
