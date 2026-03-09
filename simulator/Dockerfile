FROM ghcr.io/onflow/flow-emulator:latest

EXPOSE 8888 3569

VOLUME /data

ENTRYPOINT ["emulator"]
CMD [ \
  "--fork-host", "access.mainnet.nodes.onflow.org:9000", \
  "--skip-tx-validation", \
  "--persist", \
  "--dbpath", "/data", \
  "--chain-id", "flow-mainnet", \
  "--rest-port", "8888", \
  "--grpc-port", "3569", \
  "--log-level", "info" \
]
