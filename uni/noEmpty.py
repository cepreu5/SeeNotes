import sys
import re

def process_file(input_file, output_file):
    # Хваща "function" като самостоятелна дума (работи и с "async function")
    func_word = re.compile(r'\bfunction\b')

    in_function = False           # активен режим (махаме празни редове)
    seen_first_open = False       # видян ли е първият '{' на функцията
    brace_count = 0               # брояч на { и } вътре във функцията

    with open(input_file, "r", encoding="utf-8") as fin, \
         open(output_file, "w", encoding="utf-8") as fout:

        for line in fin:
            stripped = line.strip()

            if not in_function:
                # Засичаме декларация на функция и започваме проверката ОТ следващия ред
                if func_word.search(line):
                    in_function = True
                    seen_first_open = False
                    brace_count = 0
                    fout.write(line)  # самата декларация се записва винаги
                else:
                    fout.write(line)
            else:
                # В режим "във функция": махаме празните редове
                if stripped:
                    fout.write(line)

                # Следим баланс на скобите
                opens = line.count("{")
                closes = line.count("}")
                if opens > 0:
                    seen_first_open = True
                brace_count += opens - closes

                # Излизаме от функцията едва след като видим първия '{'
                # и балансът се върне до нула или по-малко (краят на функцията)
                if seen_first_open and brace_count <= 0:
                    in_function = False
                    seen_first_open = False
                    brace_count = 0

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python noEmpty.py <input_file> <output_file>")
        sys.exit(1)
    process_file(sys.argv[1], sys.argv[2])
