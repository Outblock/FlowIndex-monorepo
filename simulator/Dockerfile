FROM gcr.io/flow-container-registry/emulator:latest

EXPOSE 8888 3569

VOLUME /data

CMD [ \
  "emulator", "start", \
  "--rpc-host", "access.mainnet.nodes.onflow.org:9000", \
  "--skip-tx-validation", \
  "--snapshot", \
  "--persist", \
  "--dbpath", "/data", \
  "--chain-id", "mainnet", \
  "--rest-port", "8888", \
  "--port", "3569", \
  "-v" \
]
