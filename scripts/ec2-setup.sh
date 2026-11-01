#!/usr/bin/env bash
# Prepares a fresh Ubuntu EC2 instance for both parts of Assignment 2:
# swap, Docker Engine + Compose plugin, Java 21 + Jenkins LTS, Docker access for Jenkins,
# and pre-pulled base images. Safe to run more than once.
#
#   bash scripts/ec2-setup.sh
set -euo pipefail

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

log "1/6 Time zone and a 2 GiB swap file (Jenkins + two MySQL servers + two Node.js apps)"
sudo timedatectl set-timezone Asia/Karachi || true
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
free -h

log "2/6 Docker Engine and the Docker Compose plugin"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git
if ! command -v docker >/dev/null; then
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  codename=$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  if ! { sudo apt-get update -y && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; }; then
    echo "Docker's repository has no packages for '${codename}', using Ubuntu's own packages instead"
    sudo rm -f /etc/apt/sources.list.d/docker.list
    sudo apt-get update -y
    sudo apt-get install -y docker.io docker-compose-v2 docker-buildx
  fi
fi
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
sudo docker --version
sudo docker compose version

log "3/6 Java and Jenkins LTS"
if [ ! -f /usr/share/java/jenkins.war ]; then
  sudo apt-get install -y fontconfig openjdk-21-jre-headless || sudo apt-get install -y fontconfig openjdk-25-jre-headless
  sudo curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2026.key -o /etc/apt/keyrings/jenkins-keyring.asc
  echo "deb [signed-by=/etc/apt/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" \
    | sudo tee /etc/apt/sources.list.d/jenkins.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y jenkins
fi
java -version

log "4/6 Allowing the jenkins user to run Docker"
sudo usermod -aG docker jenkins
sudo systemctl enable jenkins
sudo systemctl restart jenkins

log "5/6 Pre-pulling the base images used by both parts"
sudo docker pull mysql:8.4
sudo docker pull node:22-alpine

log "6/6 Done"
sudo systemctl --no-pager --lines=0 status docker jenkins
PUBLIC_IP=$(curl -fsS -m 5 https://checkip.amazonaws.com || echo "<public-ip>")
echo
echo "Jenkins:  http://${PUBLIC_IP}:8080/"
for _ in $(seq 1 60); do
  sudo test -f /var/lib/jenkins/secrets/initialAdminPassword && break
  sudo test -f /var/lib/jenkins/jenkins.install.InstallUtil.lastExecVersion && break
  sleep 2
done
echo -n "Initial admin password: "
sudo cat /var/lib/jenkins/secrets/initialAdminPassword 2>/dev/null || echo "(already unlocked)"
echo "Log out and back in once so that '$USER' can run docker without sudo."
