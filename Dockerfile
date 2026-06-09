# 가볍고 성능이 뛰어난 Nginx Alpine 이미지를 기반으로 설정합니다.
FROM nginx:alpine

# 대시보드 정적 파일들을 Nginx 기본 서빙 경로로 복사합니다.
COPY index.html style.css app.js /usr/share/nginx/html/

# 6543 포트 수신용 커스텀 Nginx 설정 파일을 적용합니다.
COPY default.conf /etc/nginx/conf.d/default.conf

# 6543 포트를 컨테이너 외부에 노출시킵니다.
EXPOSE 6543

# Nginx 데몬을 백그라운드가 아닌 포그라운드로 실행해 컨테이너를 상시 유지합니다.
CMD ["nginx", "-g", "daemon off;"]
