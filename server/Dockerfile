FROM golang:1.24-alpine AS builder

WORKDIR /kortex

COPY . ./

RUN apk update && \
  apk upgrade -U && \
  apk add build-base libwebp-dev

RUN go mod download

RUN CGO_ENABLED=1 go build -o kortex .

FROM alpine:latest

WORKDIR /kortex

RUN apk update && \
  apk upgrade -U && \
  apk add --no-cache ca-certificates libwebp-dev curl

RUN curl -sSf https://atlasgo.sh | sh

COPY ./ent/migrate/migrations/ ./ent/migrate/migrations/

COPY --from=builder /kortex/kortex .

ENV PORT=4000
ENV HOST=0.0.0.0
ENV ENVIRONMENT=production

EXPOSE 4000

CMD [ "./kortex" ]
