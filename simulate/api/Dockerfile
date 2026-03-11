FROM golang:1.24-bookworm AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 go build -o /simulator-api .

FROM docker:27-cli AS docker-cli

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=builder /simulator-api /bin/simulator-api
ENTRYPOINT ["/bin/simulator-api"]
EXPOSE 9090
