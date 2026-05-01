#include <iostream>
#include <string>

int main() {
    std::string line;
    std::cout << "PROMPT_READY" << std::endl;
    if (std::getline(std::cin, line)) {
        std::cout << "RECEIVED: " << line << std::endl;
    } else {
        std::cerr << "INPUT_FAILED" << std::endl;
    }
    return 0;
}
