FROM alpine:latest

ARG TARGETPLATFORM
ARG BINARY

RUN apk add --no-cache libgcc libstdc++

COPY $TARGETPLATFORM/* /
ENV BINARY=$BINARY

RUN echo '#!/bin/ash' > /entrypoint.sh
RUN echo 'cat /entrypoint.sh' >> /entrypoint.sh
RUN echo 'echo " * Starting: /$BINARY $@"' >> /entrypoint.sh
RUN echo 'exec /$BINARY $@' >> /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 7446/udp
EXPOSE 7447/tcp
EXPOSE 8000/tcp

ENV RUST_LOG=info

ENTRYPOINT ["/entrypoint.sh"]
