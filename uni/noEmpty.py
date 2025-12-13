import sys

def process_file(input_file, output_file):
    in_function = False
    brace_count = 0

    with open(input_file, "r", encoding="utf-8") as fin, \
         open(output_file, "w", encoding="utf-8") as fout:

        for line in fin:
            if not in_function:
                if line.strip().startswith("function"):
                    in_function = True
                    brace_count = 0
                    fout.write(line)
                else:
                    fout.write(line)
            else:
                # броим скобите
                brace_count += line.count("{")
                brace_count -= line.count("}")

                # пропускаме празни редове
                if line.strip():
                    fout.write(line)

                # излизаме от функцията
                if brace_count <= 0 and line.strip().endswith("}"):
                    in_function = False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python noEmpty.py <input_file> <output_file>")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]
    process_file(input_file, output_file)
