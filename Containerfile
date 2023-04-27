FROM docker.io/library/node:16.17.0

COPY ./ /checkly/cli

WORKDIR /checkly/cli

RUN npm install

WORKDIR /root

ENTRYPOINT ["/checkly/cli/entrypoint.sh"]
