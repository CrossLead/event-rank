#
# Script to generate json of email events for testing from enron email corpus.
# To reproduce, download the mongoDb dump from
# http://mongodb-enron-email.s3-website-us-east-1.amazonaws.com/
# and export the messages collection to a csv
#
import csv
import json
from dateutil.parser import parse

def employees(filename='./employees.txt'):
  with open(filename, 'r') as intext:
    with open(filename.replace('txt', 'json'), 'w') as outjson:
      out = []
      for line in intext:
        out.append(line.split("\t")[0].strip() + "@enron.com")
      json.dump(out, outjson)


def mongoClean(filename='./mongo-enron.csv'):
  with open(filename, "r") as csv_file:
    csv_iterator = csv.DictReader(csv_file)
    out = []
    with open('./mongo-enron.json', 'w') as outjson:
      for row in csv_iterator:
        getSet = lambda x : set(x.strip() for x in row['headers.' + x].split(','))
        record = {
          "to" : [x for x in (getSet('To') | getSet('Bcc') | getSet('Cc')) if x],
          "from" : row['headers.From'],
          "time" : int(parse(row['headers.Date']).strftime('%s'))
        }
        out.append(record)
      json.dump(sorted(out, lambda x, y: x['time'] - y['time']), outjson)


if __name__ == '__main__':
  #mongoClean()
  employees()
