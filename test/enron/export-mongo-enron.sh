#!/usr/bin/env bash
# script to dump messages collection to csv
mongoexport \
  --type csv \
  --collection messages \
  --db enron \
  --fields "headers.To,headers.From,headers.Bcc,headers.Cc,headers.Date" \
  > mongo-enron.csv
